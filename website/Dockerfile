FROM node:20-bookworm

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN mkdir -p data
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
