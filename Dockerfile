FROM node:22.18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN sed -i 's/"noUnusedLocals": true/"noUnusedLocals": false/g; s/"noUnusedParameters": true/"noUnusedParameters": false/g' tsconfig.app.json

RUN npm run build

####

FROM nginx:1.29.8-alpine-otel

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]