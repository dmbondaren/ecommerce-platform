import React, { FC, useContext, useState } from 'react'
import { Context } from '../index'
import { observer } from 'mobx-react-lite'
import AuthService from '../services/AuthService'

interface Props { onSuccess?: () => void; onClose?: () => void }

const LoginFrom: FC<Props> = ({ onSuccess, onClose }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { store } = useContext(Context)

  const switchMode = (next: 'login'|'register'|'reset') => {
    setMode(next)
    window.history.pushState({}, '', next === 'login' ? '/auth/login' : next === 'register' ? '/auth/register' : '/auth/reset-password')
    setError('')
    setNotice('')
  }

  const submit = async () => {
    try {
      if (mode === 'reset') {
        await AuthService.requestPasswordReset(email)
        setError('')
        setNotice('Якщо така пошта є на сайті, ми надіслали лист для відновлення пароля.')
        return
      }
      if (mode === 'login') await store.login(email, password)
      else await store.registration(email, password)
      setError('')
      setNotice('')
      onSuccess?.()
    } catch (e: any) {
      const status = e?.response?.status
      const message = e?.response?.data?.message || 'Помилка авторизації'
      setError(`${status ? `Код ${status}: ` : ''}${message}`)
    }
  }

  return (
    <div className="auth-overlay">
      <div className="login">
        <button className="close-btn" onClick={onClose}>×</button>
        <div className="auth-switch">
          <button className={mode==='login' ? 'active' : ''} onClick={() => switchMode('login')}>Вхід</button>
          <button className={mode==='register' ? 'active' : ''} onClick={() => switchMode('register')}>Реєстрація</button>
        </div>
        {error && <div className="error-box">{error}</div>}
        {notice && <div className="success-box">{notice}</div>}
        <input className="auth-input" onChange={e => setEmail(e.target.value)} value={email} type="email" placeholder="Електронна пошта" />
        {mode !== 'reset' && <input className="auth-input" onChange={e => setPassword(e.target.value)} value={password} type="password" placeholder="Пароль" />}
        <button onClick={submit} className="primary auth-submit">{mode==='reset' ? 'Надіслати лист' : mode==='login' ? 'Увійти' : 'Зареєструватися'}</button>
        {mode === 'login' && <button className="link-btn auth-forgot" onClick={() => switchMode('reset')}>Забули пароль?</button>}
        {mode === 'reset' && <button className="link-btn auth-forgot" onClick={() => switchMode('login')}>Повернутися до входу</button>}
      </div>
    </div>
  )
}

export default observer(LoginFrom)
