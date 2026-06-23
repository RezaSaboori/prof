from django.urls import path
from . import views
from .views_webhook import trigger_webhook

app_name = 'dashboard'

urlpatterns = [
    path('', views.index, name='index'),
    path('infos/', views.infos, name='infos'),
    path('jobs/', views.jobs, name='jobs'),
    path('api/user-info/', views.api_user_info_get, name='api_user_info_get'),
    path('api/user-info/save/', views.api_user_info_save, name='api_user_info_save'),
    path('webhook/trigger/', trigger_webhook, name='webhook_trigger'),
]