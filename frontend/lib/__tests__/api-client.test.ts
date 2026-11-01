import { apiClient } from '../api-client';

describe('expired sessions', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('access_token', 'old-access');
    localStorage.setItem('refresh_token', 'old-refresh');
    localStorage.setItem('user', 'cached-user');
    global.fetch = jest.fn();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([401, 403])('clears invalid credentials on HTTP %i', async status => {
    (global.fetch as jest.Mock).mockResolvedValue({ok:false,status,json:async()=>({detail:'Could not validate credentials'})});
    await expect(apiClient.get('/users/profiles')).rejects.toThrow('Vui lòng đăng nhập lại');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('preserves a valid session on permission denied', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ok:false,status:403,json:async()=>({detail:'Admin role required'})});
    await expect(apiClient.get('/users/profiles')).rejects.toThrow('Admin role required');
    expect(localStorage.getItem('access_token')).toBe('old-access');
  });
});
