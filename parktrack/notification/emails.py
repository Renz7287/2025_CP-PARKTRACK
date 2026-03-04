from django.conf import settings
import logging

logger = logging.getLogger(__name__)

SUBJECTS = {
    'expiring_soon': 'ParkTrack — Your reservation is expiring soon',
    'expired':       'ParkTrack — Your reservation has expired',
    'cancelled':     'ParkTrack — Your reservation has been cancelled',
}

def send_notification_email(recipient, notif_type, message):
    email = getattr(recipient, 'email', None)
    if not email:
        return

    subject = SUBJECTS.get(notif_type, 'ParkTrack Notification')
    body = (
        f"Hi {recipient.get_full_name() or recipient.username},\n\n"
        f"{message}\n\n"
        f"Log in to ParkTrack to view your reservations.\n\n"
        f"— The ParkTrack Team"
    )

    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail

        sg   = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        mail = Mail(
            from_email         = 'parktrack3@gmail.com',
            to_emails          = email,
            subject            = subject,
            plain_text_content = body,
        )
        response = sg.send(mail)
        logger.info("Email sent to %s, status: %d", email, response.status_code)
    except Exception as exc:
        logger.warning("Failed to send notification email to %s: %s", email, exc)
        if hasattr(exc, 'body'):
            logger.warning("SendGrid error body: %s", exc.body)