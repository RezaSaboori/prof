from django.shortcuts import render
from django.contrib.auth.decorators import login_required

@login_required
def index(request):
    user = request.user
    display_name = user.first_name or user.username
    return render(request, 'dashboard/index.html', {
        'display_name': display_name, 'active_tab': 'home'})

@login_required
def infos(request):
    return render(request, 'dashboard/placeholder.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'infos', 'page_title': "Info's"})

@login_required
def jobs(request):
    return render(request, 'dashboard/placeholder.html', {
        'display_name': request.user.first_name or request.user.username,
        'active_tab': 'jobs', 'page_title': "Job's"})
