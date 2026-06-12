import { ReactNode } from 'react'

type ChatModalFrameProps = {
  children: ReactNode
  onClose: () => void
}

export default function ChatModalFrame({ children, onClose }: ChatModalFrameProps) {
  return (
    <div className='chat-modal' onClick={onClose}>
      <div className='chat-window' onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
