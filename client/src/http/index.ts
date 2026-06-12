import axios from 'axios'
import { AuthResponse } from '../models/response/AuthResponse'

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api'

const $api = axios.create({ withCredentials: true, baseURL: API_URL })

$api.interceptors.request.use((config) => {
  if (config.headers) config.headers.Authorization = `Bearer ${localStorage.getItem('token')}`
  return config
})

$api.interceptors.response.use(
  (config) => config,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && originalRequest && !originalRequest._isRetry) {
      console.warn('[401] Access token expired or unauthorized. Trying refresh...')
      originalRequest._isRetry = true
      try {
        const response = await axios.get<AuthResponse>(`${API_URL}/refresh`, { withCredentials: true })
        localStorage.setItem('token', response.data.accessToken)
        console.info('[Auth] Token refreshed successfully')
        return $api.request(originalRequest)
      } catch (refreshError: any) {
        console.error('[401] Refresh failed. User is unauthorized.', refreshError?.response?.status)
        localStorage.removeItem('token')
      }
    }
    return Promise.reject(error)
  }
)

export default $api
