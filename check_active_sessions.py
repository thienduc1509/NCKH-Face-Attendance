from datetime import date
from sqlmodel import Session,select
from app.core.db import engine
from app.models import ClassSession,ClassSection,CourseRegistration,Student,Account
from app.crud.student_schedule_crud import get_today_schedule_by_student
with engine.connect() as conn:
 tx=conn.begin();s=Session(bind=conn,join_transaction_mode='create_savepoint')
 try:
  student=s.exec(select(Student).join(Account).where(Account.username=='sv.demo01@example.com')).one()
  expected=set(s.exec(select(ClassSession.class_session_id).join(CourseRegistration,CourseRegistration.class_section_id==ClassSession.class_section_id).where(CourseRegistration.student_id==student.student_id,CourseRegistration.status.is_(True),ClassSession.status=='DANG_DIEN_RA')).all())
  rows,_=get_today_schedule_by_student(session=s,student_id=student.student_id,target_date=date(2026,10,31),active_only=True)
  assert {r.class_session_id for r in rows}==expected
  assert 1 in expected and 4 in expected
  print('PASS: sessions from previous dates appear when open')
  today,_=get_today_schedule_by_student(session=s,student_id=student.student_id,target_date=date(2026,10,31))
  assert all(r.class_date==date(2026,10,31) for r in today)
  print('PASS: today endpoint still filters by date')
  outsider=s.exec(select(Student).join(Account).where(Account.username=='demo.ui.20261031')).one()
  rows,_=get_today_schedule_by_student(session=s,student_id=outsider.student_id,target_date=date(2026,10,31),active_only=True)
  assert not rows
  print('PASS: unenrolled student sees no sessions')
  lesson=s.get(ClassSession,1);lesson.status='DA_KET_THUC';s.add(lesson);s.flush()
  rows,_=get_today_schedule_by_student(session=s,student_id=student.student_id,target_date=date(2026,10,31),active_only=True)
  assert 1 not in [r.class_session_id for r in rows]
  print('PASS: closed session disappears')
 finally:s.close();tx.rollback()
