import './FormGroup.css'

interface FormGroupProps {
  label: string
  children: React.ReactNode
  required?: boolean
}

const FormGroup: React.FC<FormGroupProps> = ({ label, children, required = false }) => {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && <span className="required">*</span>}
      </label>
      <div className="form-control">
        {children}
      </div>
    </div>
  )
}

export default FormGroup
