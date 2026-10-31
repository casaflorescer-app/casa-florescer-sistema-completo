export function passwordResetDeliveryEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return Boolean(env.CASA_SMTP_HOST?.trim());
}
