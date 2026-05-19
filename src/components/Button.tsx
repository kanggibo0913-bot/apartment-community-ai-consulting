import './Button.css'

interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  className?: string
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  onClick, 
  disabled = false,
  type = 'button',
  className = ''
}) => {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default Button
