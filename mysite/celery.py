# The following is a combination of the approaches found at:
# - https://github.com/aws/aws-xray-sdk-python/issues/92
# - https://github.com/open-telemetry/opentelemetry-python-contrib/tree/main/instrumentation/opentelemetry-instrumentation-celery

import os

from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core.utils import stacktrace
from aws_xray_sdk.ext.util import construct_xray_header, inject_trace_header
from celery import Celery, signals
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')


@signals.worker_process_init.connect(weak=False)
def trace_worker_process_init(*args, **kwargs):
    instrument()


@signals.worker_process_shutdown.connect(weak=False)
def trace_worker_process_shutdown(*args, **kwargs):
    uninstrument()


app = Celery('mysite')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks(lambda: settings.INSTALLED_APPS)


def instrument():
    signals.task_prerun.connect(trace_prerun, weak=False)
    signals.task_postrun.connect(trace_postrun, weak=False)
    signals.before_task_publish.connect(trace_before_publish, weak=False)
    signals.after_task_publish.connect(trace_after_publish, weak=False)
    signals.task_failure.connect(trace_failure, weak=False)
    signals.task_retry.connect(trace_retry, weak=False)


def uninstrument():
    signals.task_prerun.disconnect(trace_prerun)
    signals.task_postrun.disconnect(trace_postrun)
    signals.before_task_publish.disconnect(trace_before_publish)
    signals.after_task_publish.disconnect(trace_after_publish)
    signals.task_failure.disconnect(trace_failure)
    signals.task_retry.disconnect(trace_retry)


def trace_prerun(*args, **kwargs):
    task = kwargs.get('sender')
    task_id = kwargs.get('task_id')

    if task is None or task_id is None:
        return

    xray_header = construct_xray_header(task.request)
    segment = xray_recorder.begin_segment(
        name=task.name,
        traceid=xray_header.root,
        parent_id=xray_header.parent
    )
    segment.save_origin_trace_header(xray_header)
    segment.put_metadata('task_id', task_id, namespace='celery')


def trace_postrun(*args, **kwargs):
    xray_recorder.end_segment()


def trace_before_publish(*args, **kwargs):
    task_name = kwargs.get('sender')
    headers = kwargs.get('headers', {})
    body = kwargs.get('body', {})
    task_id = headers.get('id') or body.get('id')

    subsegment = xray_recorder.begin_subsegment(
        name=task_name,
        namespace='remote'
    )

    if subsegment is None:
        return

    subsegment.put_metadata('task_id', task_id, namespace='celery')

    if headers:
        inject_trace_header(headers, subsegment)


def trace_after_publish(*args, **kwargs):
    xray_recorder.end_subsegment()


def trace_failure(*args, **kwargs):
    err = kwargs.get('einfo')
    if err:
        segment = xray_recorder.current_segment()
        stack = stacktrace.get_stacktrace(limit=xray_recorder._max_trace_back)
        segment.add_exception(err.exception, stack)


def trace_retry(*args, **kwargs):
    reason = kwargs.get('reason')
    if reason:
        segment = xray_recorder.current_segment()
        segment.put_annotation('celery_retry_reason', reason)
