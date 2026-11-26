/** Email wording. No user-supplied text is included, so there is nothing to inject. */
const page = (...parts) => `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#222;max-width:34rem">${parts.join('')}</div>`;
const p = (text) => `<p>${text}</p>`;

export function passwordResetEmail({ link, minutes }) {
  const intro = 'Someone asked to reset the password for the Mindmesh account that uses this email address.';
  const expiry = `The link works once and expires in ${minutes} minutes.`;
  const ignore = 'If this wasn’t you, ignore this email. Your password has not changed.';
  return {
    subject: 'Reset your Mindmesh password',
    text: `${intro}\n\nChoose a new password:\n${link}\n\n${expiry}\n${ignore}\n`,
    html: page(
      p(intro),
      p(`<a href="${link}" style="display:inline-block;padding:10px 18px;background:#2b2b2b;color:#fff;border-radius:6px;text-decoration:none">Choose a new password</a>`),
      p(`${expiry} ${ignore}`),
      p(`<small>If the button doesn’t work, copy this address into your browser:<br>${link}</small>`)
    ),
  };
}

export function passwordChangedEmail() {
  const body = 'The password for your Mindmesh account was just changed with a reset link, and every device was signed out.';
  const warning = 'If this wasn’t you, reset your password again straight away and check that your email account is secure.';
  return {
    subject: 'Your Mindmesh password was changed',
    text: `${body}\n\n${warning}\n`,
    html: page(p(body), p(warning)),
  };
}
