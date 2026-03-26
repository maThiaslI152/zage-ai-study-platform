"""
Extract authenticated user identity from API Gateway event.
JWT validation is handled by the Cognito Authorizer in API Gateway.
By the time the Lambda runs, the claims are already verified.
"""


def get_user_id(event: dict) -> str:
    """Return the Cognito sub (userId) from the verified JWT claims."""
    try:
        claims = event["requestContext"]["authorizer"]["claims"]
        return claims["sub"]
    except KeyError:
        raise ValueError("Missing auth claims — is the Cognito authorizer configured?")


def get_user_email(event: dict) -> str:
    """Return the email from the verified JWT claims."""
    try:
        claims = event["requestContext"]["authorizer"]["claims"]
        return claims.get("email", "")
    except KeyError:
        raise ValueError("Missing auth claims")
