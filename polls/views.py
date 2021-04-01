from aws_xray_sdk.core import xray_recorder
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from django.views import generic

from .models import Choice, Question


class IndexView(generic.ListView):
    template_name = 'polls/index.html'
    context_object_name = 'latest_question_list'

    def get_queryset(self):
        """
        Return the last five published questions(not including those set to be
        published in the future).
        """
        return Question.objects.filter(
            pub_date__lte=timezone.now()
        ).order_by('-pub_date')[:5]


class DetailView(generic.DetailView):
    model = Question
    template_name = 'polls/detail.html'


class ResultsView(generic.DetailView):
    model = Question
    template_name = 'polls/results.html'


def vote(request, question_id):
    choice_id = request.POST['choice']

    with xray_recorder.capture('load_question') as subsegment:
        subsegment.put_annotation('question_id', question_id)
        question = get_object_or_404(Question, pk=question_id)

    try:
        with xray_recorder.capture('load_choice') as subsegment:
            subsegment.put_annotation('choice_id', choice_id)
            selected_choice = question.choice_set.get(pk=choice_id)
    except (KeyError, Choice.DoesNotExist):
        # Redisplay the question voting form.
        return render(request, 'polls/detail.html', {
            'question': question,
            'error_message': "You didn't select a choice.",
        })
    else:
        with xray_recorder.capture('record_vote') as subsegment:
            subsegment.put_annotation('choice_id', choice_id)
            selected_choice.votes += 1
            subsegment.put_metadata('votes', selected_choice.votes, 'polls')
            selected_choice.save()

        segment = xray_recorder.current_segment()
        segment.put_metadata('question', question.question_text, 'polls')
        segment.put_metadata(
            'selected_choice',
            selected_choice.choice_text,
            'polls'
        )
        segment.put_metadata(
            'selected_choice_votes',
            selected_choice.votes,
            'polls'
        )

        # Always return an HttpResponseRedirect after successfully dealing
        # with POST data. This prevents data from being posted twice if a
        # user hits the Back button.
        return HttpResponseRedirect(reverse('polls:results', args=(question.id,)))
