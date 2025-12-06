"""Password validation utilities."""

import re
from difflib import SequenceMatcher


# Password configuration
MIN_LENGTH = 8
SIMILARITY_THRESHOLD = 0.7
COMMON_SUBSTITUTIONS = {
    "a": "4",
    "e": "3",
    "i": "1",
    "o": "0",
    "s": "5",
    "t": "7",
    "l": "1",
    "b": "8",
    "g": "9",
}


class PasswordValidator:
    """Password validator with security checks.

    Validates passwords against various security criteria including:
    - Confirmation matching
    - Username similarity
    - Common substitutions
    - Complexity requirements
    """

    @staticmethod
    def validate(
        password: str,
        confirm_password: str,
        username: str,
    ) -> tuple[bool, list[str]]:
        """Validate password against security criteria.

        Parameters
        ----------
        password : str
            Password to validate
        confirm_password : str
            Confirmation password
        username : str
            Username to check for similarities

        Returns
        -------
        tuple[bool, list[str]]
            (is_valid, list of error messages)
        """
        errors = []

        # Check password confirmation
        if password != confirm_password:
            return False, ["Password confirmation does not match"]

        # Check username similarity
        similarity = PasswordValidator._calculate_similarity(username, password)
        if similarity > SIMILARITY_THRESHOLD:
            errors.append("Password is too similar to username")

        # Check common substitutions
        if PasswordValidator._contains_substitutions(username, password):
            errors.append("Password contains username with common substitutions")

        # Check complexity
        complexity_errors = PasswordValidator._check_complexity(password)
        errors.extend(complexity_errors)

        return len(errors) == 0, errors

    @staticmethod
    def _calculate_similarity(str1: str, str2: str) -> float:
        """Calculate similarity ratio between two strings."""
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    @staticmethod
    def _contains_substitutions(username: str, password: str) -> bool:
        """Check if password contains username with common substitutions."""
        modified_username = username.lower()
        modified_password = password.lower()

        for char, num in COMMON_SUBSTITUTIONS.items():
            modified_username = modified_username.replace(char, num)
            modified_password = modified_password.replace(char, num)

        return (modified_username in modified_password) or (
            modified_password in modified_username
        )

    @staticmethod
    def _check_complexity(password: str) -> list[str]:
        """Validate password complexity requirements."""
        checks = [
            (
                len(password) < MIN_LENGTH,
                f"Password must be at least {MIN_LENGTH} characters",
            ),
            (
                not re.search(r"[A-Z]", password),
                "Password must contain at least one uppercase letter",
            ),
            (
                not re.search(r"[a-z]", password),
                "Password must contain at least one lowercase letter",
            ),
            (
                not re.search(r"\d", password),
                "Password must contain at least one number",
            ),
            (
                not re.search(r'[!@#$%^&*(),.?":{}|<>]', password),
                "Password must contain at least one special character (!@#$%^&*)",
            ),
        ]

        return [message for check, message in checks if check]
