FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py check_runner.py digest.py digest_run.py findings_parser.py history_store.py scheduler.py CheckRoyalCaribbeanPrice.py ./

EXPOSE 5000

CMD ["python", "app.py"]
