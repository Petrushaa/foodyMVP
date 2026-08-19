from django.urls import path
from .views import (
    EmailCodeResendView, EmailVerifyView, FollowersListView, FollowingListView,
    MeView, PasswordResetConfirmView, PasswordResetRequestView,
    PasswordResetVerifyView, SubscribeView,
    UserDetailView, UserRegistrationView,
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='user-register'),
    path('email/verify/', EmailVerifyView.as_view(), name='email-verify'),
    path('email/resend/', EmailCodeResendView.as_view(), name='email-resend'),
    path('password/reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password/reset/verify/', PasswordResetVerifyView.as_view(),
         name='password-reset-verify'),
    path('password/reset/confirm/', PasswordResetConfirmView.as_view(),
         name='password-reset-confirm'),
    path('me/', MeView.as_view(), name='user-me'),
    path('<int:user_id>/', UserDetailView.as_view(), name='user-detail'),
    path('<int:user_id>/subscribe/', SubscribeView.as_view(), name='user-subscribe'),
    path('<int:user_id>/following/', FollowingListView.as_view(), name='user-following'),
    path('<int:user_id>/followers/', FollowersListView.as_view(), name='user-followers'),
]
