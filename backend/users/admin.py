from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import EmailCode, User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'full_name', 'email_verified', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        ('Extra Info', {'fields': ('full_name', 'bio_text', 'avatar', 'birth_date', 'email_verified')}),
    )


@admin.register(EmailCode)
class EmailCodeAdmin(admin.ModelAdmin):
    """
    Только для разбора жалоб «код не приходит»: видно, выдавался ли код,
    когда и сколько раз его вводили. Самого кода тут нет — он хранится хешем.
    """

    list_display = ('user', 'purpose', 'created_at', 'expires_at', 'attempts', 'used_at')
    list_filter = ('purpose',)
    search_fields = ('user__email', 'user__username')
    readonly_fields = ('user', 'purpose', 'code_hash', 'created_at', 'expires_at',
                       'attempts', 'used_at')

    def has_add_permission(self, request):
        return False
