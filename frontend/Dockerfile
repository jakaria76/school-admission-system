FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Backend URL as seen from the user's browser. Read when the container starts, so it
# can be changed with an environment variable without rebuilding the image.
ENV API_BASE_URL=http://localhost:8080
EXPOSE 80
CMD ["/bin/sh", "-c", "printf \"window.__APP_CONFIG__ = { API_BASE_URL: '%s' };\\n\" \"$API_BASE_URL\" > /usr/share/nginx/html/config.js && exec nginx -g 'daemon off;'"]
