FROM python:3.13-slim
WORKDIR /site
COPY site.b64.* /tmp/siteparts/
RUN cat /tmp/siteparts/site.b64.* | base64 -d > /tmp/site.zip  && python3 -m zipfile -e /tmp/site.zip /site  && rm -rf /tmp/site.zip /tmp/siteparts
CMD ["sh","-c","python3 -m http.server ${PORT:-8080} --bind 0.0.0.0"]
