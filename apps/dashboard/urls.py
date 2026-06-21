from django.urls import path
from . import views

app_name = 'dashboard'

urlpatterns = [
    path('',       views.index, name='index'),
    path('infos/', views.infos, name='infos'),
    path('jobs/',  views.jobs,  name='jobs'),
]
