from django.urls import path
from . import views
from .views_webhook import trigger_webhook, webhook_resume_uploaded, webhook_information_confirmed

app_name = 'dashboard'

urlpatterns = [
    path('', views.index, name='index'),
    path('infos/', views.infos, name='infos'),
    path('jobs/', views.jobs, name='jobs'),

    # ── User-info API ────────────────────────────────────────────────────────
    # IMPORTANT: 'personal/' MUST be listed before the bare 'api/user-info/'
    # route. Django matches patterns top-to-bottom and 'api/user-info/' would
    # swallow the 'personal/' request if it came first (prefix match).
    #
    # Two-phase load architecture:
    #   • api/user-info/personal/ → Phase 1: scalar fields only (~200 B, fast)
    #   • api/user-info/          → Phase 2: full row with JSON array columns
    #   • api/user-info/save/     → Upsert (PATCH or POST) the full row
    path('api/user-info/personal/', views.api_user_info_personal_get, name='api_user_info_personal_get'),
    path('api/user-info/',          views.api_user_info_get,          name='api_user_info_get'),
    path('api/user-info/save/',     views.api_user_info_save,         name='api_user_info_save'),

    path('webhook/trigger/',             trigger_webhook,              name='webhook_trigger'),
    path('webhook/resume-uploaded/',     webhook_resume_uploaded,      name='webhook_resume_uploaded'),
    path('webhook/information-confirmed/', webhook_information_confirmed, name='webhook_information_confirmed'),

    path('api/upload-resume/',    views.api_upload_resume,    name='api_upload_resume'),
    path('api/resume-status/',    views.api_resume_status,    name='api_resume_status'),
    path('api/resume-status/set/', views.api_set_resume_status, name='api_set_resume_status'),
]