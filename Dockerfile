FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       fontconfig \
       fonts-dejavu-core \
       libatomic1 \
    && curl -kfsSL https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt -o /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
    && curl -kfsSL https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt -o /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt \
    && update-ca-certificates \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm test

EXPOSE 8080
CMD ["npm", "run", "start"]
