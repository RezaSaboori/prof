import logging
import uuid
from datetime import timedelta
from datetime import timezone as datetime_timezone

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime


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

REVISION_TIMEOUT = timedelta(minutes=20)

REVISION_ERROR_GENERAL = 'revision_failed'
REVISION_ERROR_TIMEOUT = 'revision_timeout'

logger = logging.getLogger(__name__)

class DocumentRevisionError(Exception):
    def __init__(
        self,
        message,
        status=400,
        detail=None,
        code=REVISION_ERROR_GENERAL,
    ):
        super().__init__(message)

        self.message = message
        self.status = status
        self.detail = detail
        self.code = code


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

def _delete_revision(
    session,
    headers,
    *,
    job_id,
    owner_user_id,
    field,
    revision_id=None,
    request_id=None,
):
    if revision_id is None and not request_id:
        return

    params = {
        'job_id': f'eq.{job_id}',
        'user_id': f'eq.{owner_user_id}',
        'document_type': f'eq.{field}',
    }

    if revision_id is not None:
        params['id'] = f'eq.{revision_id}'

    if request_id:
        params['request_id'] = f'eq.{request_id}'

    _request(
        session,
        'DELETE',
        'job_document_revisions',
        headers,
        params=params,
        prefer='return=minimal',
    )


def _cleanup_revision_best_effort(
    session,
    headers,
    *,
    job_id,
    owner_user_id,
    field,
    revision_id=None,
    request_id=None,
):
    try:
        _delete_revision(
            session,
            headers,
            job_id=job_id,
            owner_user_id=owner_user_id,
            field=field,
            revision_id=revision_id,
            request_id=request_id,
        )

        return True

    except DocumentRevisionError as exc:
        logger.error(
            (
                'Could not clean failed document revision. '
                'job=%s field=%s revision=%s request=%s detail=%s'
            ),
            job_id,
            field,
            revision_id,
            request_id,
            exc.detail or exc.message,
        )

        return False


def _processing_revision_timed_out(revision):
    created_at_raw = revision.get('created_at')

    if not created_at_raw:
        return None

    created_at = parse_datetime(
        str(created_at_raw)
    )

    if created_at is None:
        return None

    if timezone.is_naive(created_at):
        created_at = created_at.replace(
            tzinfo=datetime_timezone.utc
        )

    return (
        timezone.now() - created_at
        >= REVISION_TIMEOUT
    )


def _revision_failure_code(revision):
    if (
        not revision or
        revision.get('source') != 'llm'
    ):
        return None

    status = _revision_status(
        revision
    )

    if status == 'processing':
        timed_out = (
            _processing_revision_timed_out(
                revision
            )
        )

        if timed_out is True:
            return REVISION_ERROR_TIMEOUT

        if timed_out is None:
            return REVISION_ERROR_GENERAL

        return None

    if status != 'ready':
        return REVISION_ERROR_GENERAL

    content = revision.get('content')

    if (
        not isinstance(content, str) or
        not content.strip()
    ):
        return REVISION_ERROR_GENERAL

    return None


def _cleanup_invalid_latest_revision(
    session,
    headers,
    *,
    job_id,
    owner_user_id,
    field,
    revisions,
):
    if not revisions:
        return revisions, None

    latest = revisions[-1]

    failure_code = (
        _revision_failure_code(
            latest
        )
    )

    if not failure_code:
        return revisions, None

    revision_id = latest.get('id')

    if revision_id is None:
        raise DocumentRevisionError(
            'Invalid document revision state',
            status=502,
            code=REVISION_ERROR_GENERAL,
        )

    _delete_revision(
        session,
        headers,
        job_id=job_id,
        owner_user_id=owner_user_id,
        field=field,
        revision_id=revision_id,
    )

    clean_revisions = _list_revisions(
        session,
        headers,
        job_id,
        owner_user_id,
        field,
    )

    return (
        clean_revisions,
        failure_code,
    )

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


def _build_state(
    job,
    revisions,
    field,
    revision_error=None,
):
    saved_revision_column = (
        DOCUMENT_FIELDS[field]
    )

    latest = (
        revisions[-1]
        if revisions
        else None
    )

    latest_status = (
        _revision_status(latest)
        if latest
        else 'ready'
    )

    return {
        'job_id': job['id'],
        'field': field,
        'saved_value':
            job.get(field) or '',
        'saved_revision_id':
            job.get(
                saved_revision_column
            ),
        'latest_revision_id': (
            latest.get('id')
            if latest
            else None
        ),
        'latest_status':
            latest_status,
        'processing':
            latest_status == 'processing',
        'revision_error':
            revision_error,
        'revisions':
            revisions,
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

    (
        revisions,
        revision_error,
    ) = _cleanup_invalid_latest_revision(
        session,
        headers,
        job_id=job['id'],
        owner_user_id=owner_user_id,
        field=field,
        revisions=revisions,
    )

    saved_revision_column = (
        DOCUMENT_FIELDS[field]
    )

    if (
        revisions and
        job.get(
            saved_revision_column
        ) is None
    ):
        saved_value = (
            job.get(field) or ''
        )

        matching_saved_revision = None

        for revision in revisions:
            revision_content = (
                revision.get('content')
                or ''
            )

            if (
                _revision_status(
                    revision
                ) == 'ready' and
                revision_content ==
                    saved_value
            ):
                matching_saved_revision = (
                    revision
                )

                break

        if (
            matching_saved_revision
            is not None
        ):
            job = _patch_job(
                session,
                headers,
                job['id'],
                owner_user_id,
                {
                    saved_revision_column:
                        matching_saved_revision[
                            'id'
                        ],
                },
            )

    return _build_state(
        job,
        revisions,
        field,
        revision_error=revision_error,
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

    if not isinstance(
        instruction,
        str,
    ):
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

    (
        revisions,
        previous_revision_error,
    ) = _cleanup_invalid_latest_revision(
        session,
        headers,
        job_id=job['id'],
        owner_user_id=owner_user_id,
        field=field,
        revisions=revisions,
    )

    if previous_revision_error:
        raise DocumentRevisionError(
            'Previous document revision was discarded',
            status=409,
            code=previous_revision_error,
        )

    job, revisions = (
        _ensure_initial_revision(
            session,
            headers,
            job=job,
            owner_user_id=owner_user_id,
            field=field,
            revisions=revisions,
        )
    )

    latest = revisions[-1]

    if (
        _revision_status(
            latest
        ) == 'processing'
    ):
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

    if (
        _revision_status(
            base_revision
        ) == 'processing'
    ):
        raise DocumentRevisionError(
            'The selected revision is still processing',
            status=409,
        )

    base_version = int(
        base_revision['version']
    )

    _delete_future_revisions(
        session,
        headers,
        job_id=job['id'],
        owner_user_id=owner_user_id,
        field=field,
        version=base_version,
    )

    base_content = (
        base_revision.get('content')
        or ''
    )

    if (
        isinstance(current_value, str) and
        current_value != base_content
    ):
        manual_revision = (
            _insert_revision(
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
                parent_revision_id=
                    base_revision['id'],
                metadata={
                    'status': 'ready',
                },
            )
        )

        base_revision = manual_revision

        base_version = int(
            manual_revision['version']
        )

        base_content = current_value

    request_id = str(
        uuid.uuid4()
    )

    try:
        processing_revision = (
            _insert_revision(
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
                parent_revision_id=
                    base_revision['id'],
                metadata={
                    'status':
                        'processing',
                },
            )
        )

        temporary_content = (
            _temporary_revision_content(
                base_content,
                instruction,
            )
        )

        ready_revision = (
            _patch_revision(
                session,
                headers,
                revision_id=
                    processing_revision[
                        'id'
                    ],
                job_id=job['id'],
                owner_user_id=
                    owner_user_id,
                field=field,
                payload={
                    'content':
                        temporary_content,
                    'metadata': {
                        'status':
                            'ready',
                        'mock':
                            True,
                    },
                },
            )
        )

        state = get_document_state(
            session,
            headers,
            django_user_id=
                django_user_id,
            email=email,
            job_id=job['id'],
            field=field,
        )

        state['request_id'] = (
            request_id
        )

        state['revision'] = (
            ready_revision
        )

        return state

    except DocumentRevisionError as exc:
        _cleanup_revision_best_effort(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=
                owner_user_id,
            field=field,
            request_id=request_id,
        )

        raise DocumentRevisionError(
            'Document revision failed',
            status=(
                exc.status
                if exc.status >= 500
                else 502
            ),
            detail=(
                exc.detail or
                exc.message
            ),
            code=
                REVISION_ERROR_GENERAL,
        ) from exc

    except Exception as exc:
        logger.exception(
            (
                'Unexpected document '
                'revision failure. '
                'job=%s field=%s '
                'request=%s'
            ),
            job['id'],
            field,
            request_id,
        )

        _cleanup_revision_best_effort(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=
                owner_user_id,
            field=field,
            request_id=request_id,
        )

        raise DocumentRevisionError(
            'Document revision failed',
            status=500,
            detail=str(exc),
            code=
                REVISION_ERROR_GENERAL,
        ) from exc

def discard_processing_revision(
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

    if not revisions:
        return _build_state(
            job,
            revisions,
            field,
        )

    latest = revisions[-1]

    latest_status = (
        _revision_status(
            latest
        )
    )

    failure_code = (
        _revision_failure_code(
            latest
        )
    )

    should_delete = (
        latest.get('source') == 'llm' and
        (
            latest_status == 'processing' or
            failure_code is not None
        )
    )

    if should_delete:
        _delete_revision(
            session,
            headers,
            job_id=job['id'],
            owner_user_id=
                owner_user_id,
            field=field,
            revision_id=
                latest.get('id'),
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