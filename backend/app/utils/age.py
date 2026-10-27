from datetime import date, datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator


def is_adult(birth_date: date, today: date | None = None) -> bool:
    today = today or datetime.now(timezone.utc).date()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return age >= 18


def validate_adult_birth_date(value: date) -> date:
    if not is_adult(value):
        raise ValueError("You must be at least 18 years old to register.")
    return value


def calendar_date(value: object) -> object:
    # Do not accept numeric Unix timestamps as dates of birth.
    if not isinstance(value, (str, date)):
        raise ValueError("Enter your date of birth in YYYY-MM-DD format.")
    return value


AdultBirthDate = Annotated[date, BeforeValidator(calendar_date), AfterValidator(validate_adult_birth_date)]
