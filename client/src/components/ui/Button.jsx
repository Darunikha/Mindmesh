import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'mm-btn-primary',
  secondary: 'mm-btn-secondary',
  ghost: 'mm-btn-ghost',
  danger: 'mm-btn-danger',
  'danger-ghost': 'mm-btn-danger-ghost',
};
const SIZES = { sm: 'mm-btn-sm', md: '', lg: 'mm-btn-lg' };

/**
 * Theme-aware button. Pass `to` to render a router Link with button styling.
 * `loading` disables the button and shows a spinner while keeping its width stable.
 */
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, iconOnly, loading, className, children, to, type = 'button', disabled, ...rest },
  ref
) {
  const classes = cn('mm-btn', VARIANTS[variant], SIZES[size], iconOnly && 'mm-btn-icon', className);
  const iconSize = size === 'sm' ? 14 : 16;
  const content = (
    <>
      {loading ? <Spinner size={iconSize} /> : Icon ? <Icon size={iconSize} aria-hidden /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={iconSize} aria-hidden /> : null}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export default Button;
