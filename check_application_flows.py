"""Application flow checks against PostgreSQL, rolled back after the run."""
import json, uuid
from datetime import date, time
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.main import app
from app.api.deps import get_db, get_current_account
from app.core.db import engine
from app.models import Account, Student, Staff, ClassSection, ClassSession, CourseRegistration, Attendance
from app.crud.attendance_crud import mark_attendance_by_lora
from app.services.recognition_stability import RecognitionStability

checks=[]
def check(name, condition):
    checks.append({'test':name,'passed':bool(condition)})
    assert condition, name

with engine.connect() as connection:
    transaction=connection.begin()
    db=Session(bind=connection,join_transaction_mode='create_savepoint')
    admin=db.exec(select(Account).where(Account.role=='ADMIN')).first()
    app.dependency_overrides[get_db]=lambda:db
    app.dependency_overrides[get_current_account]=lambda:admin
    try:
        client=TestClient(app)
        suffix=uuid.uuid4().hex[:8]
        for role in ('student','lecturer','admin'):
            payload={'username':f'qa_{role}_{suffix}','email':f'qa.{role}.{suffix}@example.com','password':'QaLocal2026!','role':role,'last_name':'Kiểm thử','first_name':role,'phone':None,'gender':'Nam'}
            r=client.post('/api/users/profiles',json=payload)
            check('create '+role+' using frontend payload',r.status_code==201)
            account_id=r.json()['account_id']
            if role!='admin':
                model=Student if role=='student' else Staff
                profile=db.exec(select(model).where(model.account_id==account_id)).first()
                check(role+' profile links email and account',profile is not None and profile.google_email==payload['email'])
            check('duplicate '+role+' rejected',client.post('/api/users/profiles',json=payload).status_code==409)
            lock=client.patch(f'/api/users/{account_id}/status',json={})
            check('lock '+role,lock.status_code==200 and lock.json()['status'] is False)
            check('unlock '+role,client.patch(f'/api/users/{account_id}/status',json={}).json()['status'] is True)
        other=dict(payload,username='another_'+suffix,role='student',email='qa.student.'+suffix+'@example.com')
        check('duplicate profile email rejected',client.post('/api/users/profiles',json=other).status_code==409)
        check('failed profile leaves no account',db.exec(select(Account).where(Account.username==other['username'])).first() is None)
        normal=db.exec(select(Account).where(Account.role=='SINH_VIEN')).first()
        app.dependency_overrides[get_current_account]=lambda:normal
        check('student cannot create accounts',client.post('/api/users/profiles',json=dict(other,email=None)).status_code==403)
        app.dependency_overrides[get_current_account]=lambda:admin
        section=db.exec(select(ClassSection)).first()
        enrolled=db.exec(select(CourseRegistration.student_id).where(CourseRegistration.class_section_id==section.class_section_id)).first()
        outsider=db.exec(select(Student).join(Account).where(Account.username=='qa_student_'+suffix)).first()
        lesson=ClassSession(class_section_id=section.class_section_id,class_date=date.today(),start_time=time(0),end_time=time(23,59),status='DANG_DIEN_RA',note='QA rollback')
        db.add(lesson);db.commit();db.refresh(lesson)
        mark_attendance_by_lora(session=db,class_session_id=lesson.class_session_id,student_ids=[enrolled,outsider.student_id])
        mark_attendance_by_lora(session=db,class_session_id=lesson.class_session_id,student_ids=[enrolled])
        rows=db.exec(select(Attendance).where(Attendance.class_session_id==lesson.class_session_id)).all()
        check('repeat recognition records only one attendance',len(rows)==1 and rows[0].student_id==enrolled)
        check('outside-class student excluded',all(x.student_id!=outsider.student_id for x in rows))
        lesson.status='DA_KET_THUC';db.add(lesson);db.commit()
        check('closed session rejects attendance',not mark_attendance_by_lora(session=db,class_session_id=lesson.class_session_id,student_ids=[enrolled])['success'])
        stable=RecognitionStability(3)
        check('first sample waits',stable.observe([1,2])==[])
        check('second sample waits',stable.observe([1,2])==[])
        check('third sample confirms multiple students',stable.observe([1,2])==[1,2])
        stable.observe([])
        check('unknown/missing frame resets confirmation',stable.observe([1])==[])
        lecturer = db.get(Account, db.get(Staff, section.staff_id).account_id)
        app.dependency_overrides[get_current_account]=lambda:lecturer
        for fmt in ('csv','xlsx'):
            r=client.get(f'/api/reports/class-sections/{section.class_section_id}/attendance?format={fmt}')
            check('export '+fmt,r.status_code==200 and len(r.content)>100)
            if fmt=='xlsx': check('xlsx is ZIP workbook',r.content[:2]==b'PK')
    finally:
        app.dependency_overrides.clear()
        db.close();transaction.rollback()
from pathlib import Path
result={'checks':checks,'passed':sum(x['passed'] for x in checks),'total':len(checks)}
Path('/tmp/app_checks_20261031.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))

