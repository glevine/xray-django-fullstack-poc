'use strict';

import { XRay } from '@aws-sdk/client-xray';

function getTime() {
    return new Date().getTime() / 1000;
}

function getHexId(length) {
    var hex = '';
    var bytes = new Uint8Array(length);

    crypto.getRandomValues(bytes);

    for (var i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16);
    }

    return hex.substring(0, length);
}

function getHexTime() {
    return Math.round(getTime()).toString(16);
}


function getTraceId() {
    return '1-' + getHexTime() + '-' + getHexId(24);
}

class Segment {
    constructor(name, parentSegment) {
        this.id = getHexId(16);
        this.name = name;
        this.annotations = {};
        this.metadata = {};
        this.error = false;

        if (parentSegment) {
            this.traceID = parentSegment.traceID;
            this.parentSegment = parentSegment;
        } else {
            this.traceID = getTraceId();
        }
    }

    get isSubsegment() {
        return !!this.parentSegment
    }

    get toJSON() {
        var data = {
            'name': this.name,
            'trace_id': this.traceID,
            'in_progress': this.active,
            'start_time': this.startTime
        };

        if (this.isSubsegment) {
            data.type = 'subsegment';
            data.parent_id = this.parentSegment.id;
        }

        if (!this.active) {
            data.end_time = this.endTime;
        }

        if (this.annotations.length > 0) {
            data.annotations = this.annotations;
        }

        if (this.metadata.length > 0) {
            data.metadata = this.metadata;
        }

        if (this.error !== false) {
            data.error = true; // Could be error, fault, or throttle. Will need to inspect the error.
            data.cause = {
                exceptions: [this.error]
            };
        }

        return JSON.stringify(data);
    }

    begin() {
        this.active = true;
        this.startTime = getTime();
    }

    end() {
        this.active = false;
        this.endTime = getTime();
    }

    annotate(key, value) {
        this.annotations[key] = value;
    }

    addMetadata(key, value, namespace) {
        if (!this.metadata.hasOwnProperty(namespace)) {
            this.metadata[namespace] = {};
        }

        this.metadata[namespace][key] = value;
    }

    addException(error) {
        this.error = error;
    }
}

// Use AWSXRayRecorder to record a trace.
export class AWSXRayRecorder {
    constructor(api) {
        this.api = api;
        this.segment = undefined;
    }

    get currentSegment() {
        return this.segment;
    }

    beginSegment(name) {
        this.segment = new Segment(name, this.segment);
        this.segment.begin();
        this.api.putTraceSegment(this.segment);
    }

    endSegment() {
        this.segment.end();
        this.api.putTraceSegment(this.segment);
        this.segment = this.segment.parentSegment;
    }

    annotateSegment(annotations) {
        for (const key in Object.keys(annotations)) {
            this.segment.annotate(key, annotations[key]);
        }

        this.api.putTraceSegment(this.segment);
    }

    addSegmentMetadata(metadata, namespace = 'default') {
        for (const key in Object.keys(annotations)) {
            this.segment.addMetadata(key, metadata[key], namespace);
        }

        this.api.putTraceSegment(this.segment);
    }

    recordError(error) {
        this.segment.addException(error);
        this.endSegment();
    }
}

// Use AWSXRayPropagator before any outgoing HTTP request to inject the
// X-Amzn-Trace-Id header.
export class AWSXRayPropagator {
    inject(recorder, carrier) {
        segment = recorder.currentSegment;
        key = 'X-Amzn-Trace-Id';
        value = `Root=${this.segment.traceID};Parent=${this.segment.id};Sampled=1`;

        if (carrier instanceof Headers) {
            carrier.append(key, value);
        } else {
            carrier[key] = value;
        }
    }
}

// AWSXRayAPI wraps the XRay SDK.
export class AWSXRayAPI {
    constructor(config = {}) {
        this.xray = new XRay(config);
    }

    putTraceSegment(segment) {
        this.xray.putTraceSegments({
            TraceSegmentDocuments: [segment.toJSON()]
        }).then((data) => {
            console.log(data);
        }).catch((error) => {
            console.error(error);
        });
    }
}
