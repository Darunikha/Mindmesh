import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from './useForm.js';
import { ApiRequestError } from '../api/client.js';
import { TextArea, TextField, SelectField } from '../components/ui/Field.jsx';

afterEach(cleanup);

const submitEvent = () => ({ preventDefault: vi.fn() });

describe('useForm: field binding', () => {
  it('binds a field: name, current value (empty string when unset) and no error at first', () => {
    const { result } = renderHook(() => useForm({ email: 'a@b.c' }));
    expect(result.current.bind('email')).toMatchObject({ name: 'email', value: 'a@b.c', error: undefined });
    expect(result.current.bind('missing').value).toBe('');
  });

  it('updates from an input event or from a plain value', () => {
    const { result } = renderHook(() => useForm({ a: '', b: '' }));
    act(() => result.current.bind('a').onChange({ target: { value: 'typed' } }));
    act(() => result.current.bind('b').onChange('direct'));
    expect(result.current.values).toEqual({ a: 'typed', b: 'direct' });
  });

  it('clears only the edited field’s error, leaving the others', () => {
    const { result } = renderHook(() => useForm({ a: '', b: '' }));
    act(() => result.current.setErrors({ a: 'Bad a', b: 'Bad b' }));
    expect(result.current.bind('a').error).toBe('Bad a');
    act(() => result.current.bind('a').onChange('x'));
    expect(result.current.bind('a').error).toBeUndefined();
    expect(result.current.bind('b').error).toBe('Bad b');
  });

  it('reset restores the initial values and clears errors', () => {
    const initial = { a: '' };
    const { result } = renderHook(() => useForm(initial));
    act(() => {
      result.current.bind('a').onChange('x');
      result.current.setErrors({ a: 'err' });
      result.current.setFormError('boom');
    });
    act(() => result.current.reset());
    expect(result.current.values).toEqual({ a: '' });
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBeNull();
    act(() => result.current.reset({ a: 'other' }));
    expect(result.current.values).toEqual({ a: 'other' });
  });
});

describe('useForm: submitting', () => {
  it('prevents the browser’s own submit and passes the values to your function', async () => {
    const fn = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useForm({ name: 'Ada' }));
    const e = submitEvent();
    await act(async () => result.current.handleSubmit(fn)(e));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(fn).toHaveBeenCalledWith({ name: 'Ada' });
  });

  it('shows validation errors and does not call your function', async () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useForm({ name: '' }, { validate: (v) => ({ name: v.name ? undefined : 'Required' }) }));
    await act(async () => result.current.handleSubmit(fn)(submitEvent()));
    expect(fn).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({ name: 'Required' });
    expect(result.current.submitting).toBe(false);
  });

  it('submits once validation passes, and a validator returning only undefined counts as valid', async () => {
    const fn = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useForm({ name: 'x' }, { validate: () => ({ name: undefined }) }));
    await act(async () => result.current.handleSubmit(fn)(submitEvent()));
    expect(fn).toHaveBeenCalled();
  });

  it('is "submitting" while the request runs, then not (even after a failure)', async () => {
    let finish;
    const fn = vi.fn(() => new Promise((r) => (finish = r)));
    const { result } = renderHook(() => useForm({}));
    let pending;
    act(() => void (pending = result.current.handleSubmit(fn)(submitEvent())));
    expect(result.current.submitting).toBe(true);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.submitting).toBe(false);

    const failing = vi.fn().mockRejectedValue(new Error('nope'));
    await act(async () => result.current.handleSubmit(failing)(submitEvent()));
    expect(result.current.submitting).toBe(false);
    expect(result.current.formError).toBe('nope');
  });

  it('works without an event object', async () => {
    const fn = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useForm({}));
    await act(async () => result.current.handleSubmit(fn)());
    expect(fn).toHaveBeenCalled();
  });

  it('clears an earlier form-level error when you submit again', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('first failure')).mockResolvedValue();
    const { result } = renderHook(() => useForm({}));
    await act(async () => result.current.handleSubmit(fn)(submitEvent()));
    expect(result.current.formError).toBe('first failure');
    await act(async () => result.current.handleSubmit(fn)(submitEvent()));
    expect(result.current.formError).toBeNull();
  });
});

describe('useForm: server errors', () => {
  const rejectWith = (err) => vi.fn().mockRejectedValue(err);

  it('puts field-level API errors on the fields', async () => {
    const { result } = renderHook(() => useForm({ email: '', password: '' }));
    await act(async () => result.current.handleSubmit(rejectWith(new ApiRequestError(400, 'Invalid', 'VALIDATION', { fields: { email: 'Already registered' } })))(submitEvent()));
    expect(result.current.errors).toEqual({ email: 'Already registered' });
    expect(result.current.formError).toBeNull();
  });

  it('shows the message at form level when the error is about fields this form does not have', async () => {
    const { result } = renderHook(() => useForm({ email: '' }));
    await act(async () => result.current.handleSubmit(rejectWith(new ApiRequestError(400, 'Something is off', 'VALIDATION', { fields: { unknownField: 'bad' } })))(submitEvent()));
    expect(result.current.formError).toBe('Something is off');
  });

  it('shows other API errors, and unexpected errors, at form level', async () => {
    const { result } = renderHook(() => useForm({}));
    await act(async () => result.current.handleSubmit(rejectWith(new ApiRequestError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS')))(submitEvent()));
    expect(result.current.formError).toBe('Incorrect email or password');
    await act(async () => result.current.handleSubmit(rejectWith({}))(submitEvent()));
    expect(result.current.formError).toBe('Something went wrong');
  });
});

describe('form fields', () => {
  it('a text field connects its label, error and hint for assistive technology', () => {
    const { rerender } = render(<TextField label="Email" hint="We never share it" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('We never share it');
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(<TextField label="Email" hint="We never share it" error="Enter a valid email" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
    expect(screen.queryByText('We never share it')).toBeNull();
  });

  it('marks optional fields', () => {
    render(<TextField label="Bio" optional />);
    expect(screen.getByText('optional')).toBeInTheDocument();
  });

  it('a password field can be shown and hidden', async () => {
    const user = userEvent.setup();
    render(<TextField label="Password" type="password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('other fields get no show/hide button', () => {
    render(<TextField label="Name" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('text areas and selects wire up label and error the same way', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <TextArea label="Notes" error="Too long" />
        <SelectField
          label="Sort"
          value="a"
          onChange={onChange}
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ]}
        />
      </>
    );
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Notes')).toHaveAccessibleDescription('Too long');
    await user.selectOptions(screen.getByLabelText('Sort'), 'b');
    expect(onChange).toHaveBeenCalled();
  });
});
