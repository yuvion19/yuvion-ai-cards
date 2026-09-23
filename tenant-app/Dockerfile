FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl fontconfig fonts-dejavu-core \
  && curl -kfsSL https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt -o /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
  && curl -kfsSL https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt -o /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt \
  && update-ca-certificates \
  && fc-cache -f -v \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
CMD ["npm","start"]
