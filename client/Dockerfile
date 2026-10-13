FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback so client-side routes (/vehicles/3, /invoices/2...) work on refresh
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
