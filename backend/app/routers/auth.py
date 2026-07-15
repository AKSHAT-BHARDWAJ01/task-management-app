from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import TokenResponse, UserLogin, UserRead, UserRegistration
from app.services import auth_service, user_service


auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@auth_router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegistration, db: Session = Depends(get_db)):
    if user_service.get_user_by_email(db, payload.email) is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    return user_service.create_user(db, payload.name, payload.email, payload.password)


@auth_router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = user_service.get_user_by_email(db, payload.email)
    if user is None or not auth_service.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {
        "access_token": auth_service.create_access_token(user),
        "token_type": "bearer",
        "user": user,
    }
