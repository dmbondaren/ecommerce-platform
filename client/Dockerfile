FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS dev

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3000
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

COPY . .
EXPOSE 3000
CMD ["npm", "start"]

FROM deps AS build

ARG REACT_APP_API_URL=http://localhost:5000/api
ARG REACT_APP_WS_URL=ws://localhost:5000/ws
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
