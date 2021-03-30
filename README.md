# POC: Instrument Django application with AWS X-Ray

## Goals

* Collect traces in AWS X-Ray
* Start traces in browser client that are continued in Django server

## Demo

```bash
$ pip install -r requirements.txt
$ python manage.py runserver --settings=mysite.settings
```

1. Create a poll at http://localhost:8000/admin.
2. Vote at http://localhost:8000/polls/.
