import requests

payload = {
    'messages': [
        {'role': 'user', 'content': 'Write a very long detailed explanation of how a large language model works, including layers, training, tokens, attention, and inference, in a structured format with multiple sections.'}
    ]
}

r = requests.post('http://127.0.0.1:5000/api/chat', json=payload, timeout=60)
print('status', r.status_code)
print(r.text[:4000])
