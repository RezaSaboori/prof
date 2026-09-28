import uuid

import requests
from django.conf import settings


DOCUMENT_FIELDS = {
    'cover_letter': 'cover_letter_saved_revision_id',
    'resume': 'resume_saved_revision_id',
}

JOB_SELECT = (
    'id,user_id,paid,cover_letter,resume,'
    'cover_letter_saved_revision_id,'
    'resume_saved_revision_id'
)

REVISION_SELECT = (
    'id,job_id,user_id,document_type,version,instruction,'
    'content,source,request_id,parent_revision_id,created_at,metadata'
)


class DocumentRevisionError(Exception):
    def __init__(self, message, status=400, detail=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.detail = detail


def _request(
    session,
    method,
    table,
    headers,
    *,
    params=None,
    payload=None,
    prefer=None,
    timeout=(5, 15),
):
    request_headers = dict(headers)

    if prefer:
        request_headers['Prefer'] = prefer

    try:
        response = session.request(
            method,
            f'{settings.SUPABASE_URL}/rest/v1/{table}',
            params=params,
            json=payload,
            headers=request_headers,
            timeout=timeout,
        )
    except requests.exceptions.Timeout as exc:
        raise DocumentRevisionError(
            'Supabase request timed out',
            status=504,
        ) from exc
    except requests.exceptions.ConnectionError as exc:
        raise DocumentRevisionError(
            'Could not connect to Supabase',
            status=502,
        ) from exc
    except requests.RequestException as exc:
        raise DocumentRevisionError(
            'Supabase request failed',
            status=502,
            detail=str(exc),
        ) from exc

    if not response.ok:
        status = 409 if response.status_code == 409 else 502

        raise DocumentRevisionError(
            'Supabase request failed',
            status=status,
            detail=response.text,
        )

    if not response.text.strip():
        return None

    try:
        return response.json()
    except ValueError:
        return None


def _validate_field(field):
    if field not in DOCUMENT_FIELDS:
        raise DocumentRevisionError(
            'Invalid document field',
            status=400,
        )


def _fetch_job_for_user_id(
    session,
    headers,
    job_id,
    user_id,
):
    rows = _request(
        session,
        'GET',
        'jobs_processed',
        headers,
        params={
            'id': f'eq.{job_id}',
            'user_id': f'eq.{user_id}',
            'paid': 'eq.1',
            'select': JOB_SELECT,
            'limit': 1,
        },
    )

    return rows[0] if rows else None


def _resolve_job(
    session,
    headers,
    django_user_id,
    email,
    job_id,
):
    job = _fetch_job_for_user_id(
        session,
        headers,
        job_id,
        django_user_id,
    )

    if job:
        return job, str(job['user_id'])

    user_rows = _request(
        session,
        'GET',
        'user_info',
        headers,
        params={
            'email': f'eq.{email}',
            'select': 'id',
            'limit': 1,
        },
        timeout=(5, 10),
    )

    if not user_rows:
        raise DocumentRevisionError(
            'job not found or not unlocked',
            status=404,
        )

    user_info_id = user_rows[0].get('id')

    job = _fetch_job_for_user_id(
        session,
        headers,
        job_id,
        user_info_id,
    )

    if not job:
        raise DocumentRevisionError(
            'job not found or not unlocked',
            status=404,
        )

    return job, str(job['user_id'])


def _list_revisions(
    session,
    headers,
    job_id,
    owner_user_id,
    field,
):
    rows = _request(
        session,
        'GET',
        'job_document_revisions',
        headers,
        params={
            'job_id': f'eq.{job_id}',
            'user_id': f'eq.{owner_user_id}',
            'document_type': f'eq.{field}',
            'select': REVISION_SELECT,
            'order': 'version.asc',
        },
    )

    return rows or []


def _patch_job(
    session,
    headers,
    job_id,
    owner_user_id,
    payload,
):
    rows = _request(
        session,
        'PATCH',
        'jobs_processed',
        headers,
        params={
            'id': f'eq.{job_id}',
            'user_id': f'eq.{owner_user_id}',
            'paid': 'eq.1',
        },
        payload=payload,
        prefer='return=representation',
    )

    if not rows:
        raise DocumentRevisionError(
            'job not found or not unlocked',
            status=404,
        )

    return rows[0]


def _insert_revision(
    session,
    headers,
    *,
    job_id,
    owner_user_id,
    field,
    version,
    instruction,
    content,
    source,
    request_id,
    parent_revision_id,
    metadata,
):
    rows = _request(
        session,
        'POST',
        'job_document_revisions',
        headers,
        payload={
            'job_id': job_id,
            'user_id': owner_user_id,
            'document_type': field,
            'version': version,
            'instruction': instruction,
            'content': content,
            'source': source,
            'request_id': request_id,
            'parent_revision_id': parent_revision_id,
            'metadata': metadata,
        },
        prefer='return=representation',
    )

    if not rows:
        raise DocumentRevisionError(
            'Could not create document revision',
            status=502,
        )

    return rows[0]


def _patch_revision(
    session,
    headers,
    *,
    revision_id,
    job_id,
    owner_user_id,
    field,
    payload,
):
    rows = _request(
        session,
        'PATCH',
        'job_document_revisions',
        headers,
        params={
            'id': f'eq.{revision_id}',
            'job_id': f'eq.{job_id}',
            'user_id': f'eq.{owner_user_id}',
            'document_type': f'eq.{field}',
        },
        payload=payload,
        prefer='return=representation',
    )

    if not rows:
        raise DocumentRevisionError(
            'Document revision not found',
            status=404,
        )

    return rows[0]


def _delete_future_revisions(
    session,
    headers,
    *,
    job_id,
    owner_user_id,
    field,
    version,
):
    _request(
        session,
        'DELETE',
        'job_document_revisions',
        headers,
        params={
            'job_id': f'eq.{job_id}',
            'user_id': f'eq.{owner_user_id}',
            'document_type': f'eq.{field}',
            'version': f'gt.{version}',
        },
        prefer='return=minimal',
    )


def _revision_status(revision):
    metadata = revision.get('metadata')

    if not isinstance(metadata, dict):
        return 'ready'

    return metadata.get('status') or 'ready'


def _find_revision(revisions, revision_id):
    if revision_id is None:
        return None

    revision_id = str(revision_id)

    for revision in revisions:
        if str(revision.get('id')) == revision_id:
            return revision

    return None


def _build_state(job, revisions, field):
    saved_revision_column = DOCUMENT_FIELDS[field]
    latest = revisions[-1] if revisions else None

    latest_status = (
        _revision_status(latest)
        if latest
        else 'ready'
    )

    return {
        'job_id': job['id'],
        'field': field,
        'saved_value': job.get(field) or '',
        'saved_revision_id': job.get(saved_revision_column),
        'latest_revision_id': (
            latest.get('id')
            if latest
            else None
        ),
        'latest_status': latest_status,
        'processing': latest_status == 'processing',
        'revisions': revisions,
    }


def get_document_state(
    session,
    headers,
    *,
    django_user_id,
    email,
    job_id,
    field,
):
    _validate_field(field)

    job, owner_user_id = _resolve_job(
        session,
        headers,
        django_user_id,
        email,
        job_id,
    )

    revisions = _list_revisions(
        session,
        headers,
        job['id'],
        owner_user_id,
        field,
    )

    return _build_state(
        job,
        revisions,
        field,
    )


def _ensure_initial_revision(
    session,
    headers,
    *,
    job,
    owner_user_id,
    field,
    revisions,
):
    if revisions:
        return job, revisions

    try:
        initial_revision = _insert_revision(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=owner_user_id,
            field=field,
            version=1,
            instruction=None,
            content=job.get(field) or '',
            source='initial',
            request_id=None,
            parent_revision_id=None,
            metadata={
                'status': 'ready',
            },
        )

        revisions = [initial_revision]

    except DocumentRevisionError as exc:
        if exc.status != 409:
            raise

        revisions = _list_revisions(
            session,
            headers,
            job['id'],
            owner_user_id,
            field,
        )

        if not revisions:
            raise

        initial_revision = revisions[0]

    saved_revision_column = DOCUMENT_FIELDS[field]

    if job.get(saved_revision_column) is None:
        job = _patch_job(
            session,
            headers,
            job['id'],
            owner_user_id,
            {
                saved_revision_column:
                    initial_revision['id'],
            },
        )

    return job, revisions


def _temporary_revision_content(
    current_content,
    instruction,
):
    current_content = (current_content or '').rstrip()

    if not current_content:
        return instruction

    return f'{current_content}\n{instruction}'


def create_revision_request(
    session,
    headers,
    *,
    django_user_id,
    email,
    job_id,
    field,
    instruction,
    current_revision_id=None,
    current_value=None,
):
    _validate_field(field)

    if not isinstance(instruction, str):
        raise DocumentRevisionError(
            'instruction must be a string',
            status=400,
        )

    instruction = instruction.strip()

    if not instruction:
        raise DocumentRevisionError(
            'instruction is required',
            status=400,
        )

    job, owner_user_id = _resolve_job(
        session,
        headers,
        django_user_id,
        email,
        job_id,
    )

    revisions = _list_revisions(
        session,
        headers,
        job['id'],
        owner_user_id,
        field,
    )

    job, revisions = _ensure_initial_revision(
        session,
        headers,
        job=job,
        owner_user_id=owner_user_id,
        field=field,
        revisions=revisions,
    )

    latest = revisions[-1]

    if _revision_status(latest) == 'processing':
        raise DocumentRevisionError(
            'A document revision is already processing',
            status=409,
        )

    if current_revision_id is None:
        base_revision = latest
    else:
        base_revision = _find_revision(
            revisions,
            current_revision_id,
        )

        if not base_revision:
            raise DocumentRevisionError(
                'Selected document revision no longer exists',
                status=409,
            )

    if _revision_status(base_revision) == 'processing':
        raise DocumentRevisionError(
            'The selected revision is still processing',
            status=409,
        )

    base_version = int(base_revision['version'])

    _delete_future_revisions(
        session,
        headers,
        job_id=job['id'],
        owner_user_id=owner_user_id,
        field=field,
        version=base_version,
    )

    base_content = base_revision.get('content') or ''

    if (
        isinstance(current_value, str) and
        current_value != base_content
    ):
        manual_revision = _insert_revision(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=owner_user_id,
            field=field,
            version=base_version + 1,
            instruction=None,
            content=current_value,
            source='manual',
            request_id=None,
            parent_revision_id=base_revision['id'],
            metadata={
                'status': 'ready',
            },
        )

        base_revision = manual_revision
        base_version = int(manual_revision['version'])
        base_content = current_value

    request_id = str(uuid.uuid4())

    processing_revision = _insert_revision(
        session,
        headers,
        job_id=job['id'],
        owner_user_id=owner_user_id,
        field=field,
        version=base_version + 1,
        instruction=instruction,
        content=base_content,
        source='llm',
        request_id=request_id,
        parent_revision_id=base_revision['id'],
        metadata={
            'status': 'processing',
        },
    )

    temporary_content = _temporary_revision_content(
        base_content,
        instruction,
    )

    ready_revision = _patch_revision(
        session,
        headers,
        revision_id=processing_revision['id'],
        job_id=job['id'],
        owner_user_id=owner_user_id,
        field=field,
        payload={
            'content': temporary_content,
            'metadata': {
                'status': 'ready',
                'mock': True,
            },
        },
    )

    state = get_document_state(
        session,
        headers,
        django_user_id=django_user_id,
        email=email,
        job_id=job['id'],
        field=field,
    )

    state['request_id'] = request_id
    state['revision'] = ready_revision

    return state


def save_document(
    session,
    headers,
    *,
    django_user_id,
    email,
    job_id,
    field,
    value,
    current_revision_id=None,
):
    _validate_field(field)

    if not isinstance(value, str):
        raise DocumentRevisionError(
            'value must be a string',
            status=400,
        )

    job, owner_user_id = _resolve_job(
        session,
        headers,
        django_user_id,
        email,
        job_id,
    )

    revisions = _list_revisions(
        session,
        headers,
        job['id'],
        owner_user_id,
        field,
    )

    if not revisions:
        _patch_job(
            session,
            headers,
            job['id'],
            owner_user_id,
            {
                field: value,
            },
        )

        return get_document_state(
            session,
            headers,
            django_user_id=django_user_id,
            email=email,
            job_id=job['id'],
            field=field,
        )

    if current_revision_id is None:
        selected_revision = revisions[-1]
    else:
        selected_revision = _find_revision(
            revisions,
            current_revision_id,
        )

        if not selected_revision:
            raise DocumentRevisionError(
                'Selected document revision no longer exists',
                status=409,
            )

    if _revision_status(selected_revision) == 'processing':
        raise DocumentRevisionError(
            'The selected revision is still processing',
            status=409,
        )

    selected_content = selected_revision.get('content') or ''

    if value != selected_content:
        selected_version = int(
            selected_revision['version']
        )

        _delete_future_revisions(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=owner_user_id,
            field=field,
            version=selected_version,
        )

        selected_revision = _insert_revision(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=owner_user_id,
            field=field,
            version=selected_version + 1,
            instruction=None,
            content=value,
            source='manual',
            request_id=None,
            parent_revision_id=selected_revision['id'],
            metadata={
                'status': 'ready',
            },
        )

    saved_revision_column = DOCUMENT_FIELDS[field]

    _patch_job(
        session,
        headers,
        job['id'],
        owner_user_id,
        {
            field: value,
            saved_revision_column:
                selected_revision['id'],
        },
    )

    return get_document_state(
        session,
        headers,
        django_user_id=django_user_id,
        email=email,
        job_id=job['id'],
        field=field,
    )