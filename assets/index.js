'use strict';

import $ from 'jquery';
import { AWSXRayAPI, AWSXRayPropagator, AWSXRayRecorder } from './xray';

// Need to use an AWS Cognito unauthenticated identity in order to send traces.
const xray = new AWSXRayAPI({ region: 'us-west-2' });
const propagator = new AWSXRayPropagator();

function vote(event) {
    const recorder = new AWSXRayRecorder(xray);

    // One downside of using AWS X-Ray is that segment names are service names.
    // This could make it difficult to find all traces related to a single
    // product or service. We either need to always have an outer segment
    // auto-instrumentation or use auto-apply annotations that can be used to
    // filter traces. A naming convention for segments may also work.
    recorder.beginSegment('xray-django-fullstack-poc.submit_vote');

    event.preventDefault();

    headers = new Headers({
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': $('input[name="csrfmiddlewaretoken"]').val()
    });
    propagator.inject(recorder, headers);

    fetch(event.target.action, {
        method: 'POST',
        cache: 'no-cache',
        headers: headers,
        body: new URLSearchParams({
            'choice': $('input[name="choice"]:checked').val()
        })
    })
        .then((response) => {
            recorder.endSegment();

            if (response.redirected) {
                window.location.href = response.url;
            }
        })
        .catch((error) => {
            recorder.recordException(error);
        });

    return false;
}
window.vote = vote;
