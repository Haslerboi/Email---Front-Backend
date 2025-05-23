# Email Assistant Frontend

A React-based web application that interfaces with an email assistant backend. This frontend allows users to:

- View a list of incoming email queries
- Provide answers to questions needed by the backend
- Review and edit suggested email drafts before sending
- See history of processed emails and drafts

## Technologies Used

- React 19
- React Router 6
- Material UI
- Axios for API communication
- Vite for build tooling

## Setup and Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with:
   ```
   VITE_API_URL=http://your-backend-api-url.com/api
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## Features

### Authentication
- Login functionality
- Protected routes
- Auth token management

### Email Management
- View incoming emails
- Answer questions from the AI assistant
- Review and edit draft replies
- View history of processed emails

## API Integration

The frontend is designed to work with a backend API. The API endpoints expected are:

- `/auth/login` - User authentication
- `/emails` - Get list of emails
- `/drafts` - Get email drafts
- `/questions` - Get pending questions
- `/questions/:id/answer` - Answer a pending question
- `/drafts/:id/approve` - Approve and send a draft

## Development

To build for production:

```
npm run build
```

To preview the production build:

```
npm run preview
```

## License

[MIT](LICENSE)
