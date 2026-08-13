from django.urls import path
from .views import (
    FollowersListView, FollowingListView, MeView, SubscribeView,
    UserDetailView, UserRegistrationView,
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='user-register'),
    path('me/', MeView.as_view(), name='user-me'),
    path('<int:user_id>/', UserDetailView.as_view(), name='user-detail'),
    path('<int:user_id>/subscribe/', SubscribeView.as_view(), name='user-subscribe'),
    path('<int:user_id>/following/', FollowingListView.as_view(), name='user-following'),
    path('<int:user_id>/followers/', FollowersListView.as_view(), name='user-followers'),
]
