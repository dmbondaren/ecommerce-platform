import { ButtonHTMLAttributes, ReactNode } from 'react'

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'default' | 'icon'
  children: ReactNode
}

export default function ActionButton({ variant = 'default', className = '', children, ...props }: ActionButtonProps) {
  const variantClass = variant === 'primary' ? 'primary' : variant === 'icon' ? 'icon-btn' : ''
  return <button className={[variantClass, className].filter(Boolean).join(' ')} {...props}>{children}</button>
}
