# Study Social Sphere using React, Node.js, and Firebase

> **Note on the source code in this repository:** the **React frontend is not
> included here.** Its source was never committed to this repository. What is
> included is the complete Firebase Cloud Functions backend that powered the
> application, plus the frontend's Firebase Hosting configuration. See
> [Repository Contents](#repository-contents) below.

**Introduction**

Study Social Sphere is a social media platforms are interactive technologies that allow users to create or share information, ideas, career interests, and other forms of expression through online communities and networks. The vast number of social media services available, both independent and integrated with other platforms, can make defining them a challenge. However, some common features tie them together:

  - Interactive Web Applications: Social media platforms are interactive web applications built on Web 2.0 principles.
  - User-Generated Content: User-generated content, such as text posts, comments, photos, videos, and data from online interactions, is the foundation of social media.
  - User Profiles: Users create profiles specific to each platform, allowing them to build online identities.
  - Social Networks: Social media fosters online social networks by connecting users with others who share similar interests.
  - Mobile Accessibility: Users can access social media services through web browsers on desktops and laptops, or through mobile apps on smartphones and tablets. This widespread accessibility allows users to interact and create highly interactive platforms where individuals, communities, and organizations can share, co-create, discuss, and modify content.

**Problem Description**

This social media platform is designed specifically for educational purposes. As technology and learning systems advance, it's increasingly important for students and mentors to stay connected and engaged with their subjects. This application aims to bridge the communication gap between them.

**Improved Communication and Real-Time Information**

Social media integration offers a powerful communication tool for the educational world. It fosters improved communication with all stakeholders, including students, mentors, and the broader community. Schools can leverage social media to efficiently share events, activities, and real-time information, filling the gap where traditional methods might fall short. Social media's ability to facilitate instant communication makes it invaluable for disseminating critical information quickly.

**Repository Contents**

<a name="repository-contents"></a>

```
socialmedia-functions/     the backend - complete and included
  functions/
    index.js               Express API + Firestore triggers (asia-east2)
    handlers/screams.js    posts, comments, likes
    handlers/users.js      signup, login, profile, image upload
    util/                  admin init, auth middleware, validators

socialmedia-ui/            the frontend - source NOT included
  firebase.json            Hosting config, kept to document the deployment
  README.md                explains what is missing
```

`socialmedia-functions` is the working part of this project. It implements the
full REST API - authentication with Firebase Auth, a Firestore-backed feed with
posts, comments and likes, profile image upload to Cloud Storage, and Firestore
triggers that fan out notifications and keep denormalised user images in sync.

`socialmedia-ui` was a Create React App client (React 16, Material-UI, Redux,
`axios`) that consumed that API. Only its Hosting configuration survives in this
repository - the application source was never committed, so the folder cannot be
installed or built from here.

The hosted demo is no longer running - the Firebase project that backed it is
no longer active, so the deployed API does not respond. The backend source in
this repository is complete and can be deployed to a new Firebase project.
