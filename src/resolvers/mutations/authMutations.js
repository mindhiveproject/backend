const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const postmark = require('postmark');

const client = new postmark.Client(process.env.MAIL_POSTMARK_CLIENT);
const { transport, makeEmail } = require('../../mail');

// const checkSafari = browser => {
//   const re = /(iPhone; CPU iPhone OS 1[0-2]|iPad; CPU OS 1[0-2]|iPod touch; CPU iPhone OS 1[0-2]|Macintosh; Intel Mac OS X.*Version\x2F1[0-2].*Safari|Macintosh;.*Mac OS X 10_(14|15).* AppleWebKit.*Version\x2F1[0-3].*Safari)/;
//   const isSafari = re.test(browser);
//   console.log('insde checkSafari function browser is', browser);
//   let settings;
//   if (isSafari) {
//     settings = {
//       httpOnly: true,
//       maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
//     };
//   } else {
//     settings = {
//       httpOnly: true,
//       maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
//       sameSite: 'Strict',
//       secure: process.env.NODE_ENV === 'production',
//     };
//   }
//   return settings;
// };

const authMutations = {
  // sign up a new user with email authentication identity
  async emailSignUp(parent, args, ctx, info) {
    args.email = args.email.toLowerCase(); // lower case email address
    args.username = args.username.toLowerCase(); // lower case username
    // hash the password
    const password = await bcrypt.hash(args.password, 10);

    // TODO: if the user does not have a profile, create a profile (which will have the email auth identity)
    // create a profile (which will have the email auth identity)
    const profile = await ctx.db.mutation.createProfile(
      {
        data: {
          username: args.username,
          permissions: { set: ['TEACHER'] },
        },
      },
      `{ id }`
    );

    // create a email authentication identity
    const authEmail = await ctx.db.mutation.createAuthEmail(
      {
        data: {
          email: args.email,
          password,
          profile: {
            connect: {
              id: profile.id,
            },
          },
        },
      },
      `{ id }`
    );
    // connect the email auth identity to profile
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          authEmail: {
            connect: {
              id: authEmail.id,
            },
          },
        },
        where: {
          id: profile.id,
        },
      },
      `{ id username permissions }`
    );

    // create the JWT token for user
    const token = jwt.sign(
      { userId: updatedProfile.id },
      process.env.APP_SECRET
    );
    // set the jwt as a cookie on response
    // const isSafari = checkSafari(ctx.request.headers['user-agent']);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // return user
    return updatedProfile;
  },

  async emailLogin(parent, { email, password }, ctx, info) {
    // 1. Check if there is a email auth identity with that email
    const authEmail = await ctx.db.query.authEmail(
      {
        where: { email },
      },
      `{ id password profile {id} }`
    );
    if (!authEmail) {
      throw new Error(`No such user found for email ${email}`);
    }
    // 2. Check whether the password is correct
    const valid = await bcrypt.compare(password, authEmail.password);
    if (!valid) {
      throw new Error(`Invalid password!`);
    }
    // 3. Find the profile which has this auth identity
    const profile = await ctx.db.query.profile(
      {
        where: {
          id: authEmail.profile.id,
        },
      },
      info
    );
    // 3. Generate the JWT token
    const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
    // 4. Set the cookie with the token
    // const isSafari = checkSafari(ctx.request.headers['user-agent']);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // 5. Return the user
    return profile;
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'You are signed out!' };
  },

  async requestReset(parent, args, ctx, info) {
    // 1. Check if it is a real user
    const authEmail = await ctx.db.query.authEmail({
      where: { email: args.email },
    });
    if (!authEmail) {
      throw new Error(`There is no user with the email address ${args.email}`);
    }
    // 2. Set a reset token and expiry on that user
    const randomBytesPromise = promisify(randomBytes);
    const resetToken = (await randomBytesPromise(25)).toString('hex');
    const resetTokenExpiry = Date.now() + 1000 * 60 * 60; // 1 hour
    const res = await ctx.db.mutation.updateAuthEmail({
      where: {
        email: args.email,
      },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });
    // 3. Email the user the reset token

    // const html = generateHTML(options.filename, options);
    // const text = htmlToText.fromString(html);
    // client.sendEmail({
    //   From: `info@mindhive.com`,
    //   To: 'info@mindhive.com',
    //   Subject: 'Your password reset token',
    //   HtmlBody: makeEmail(`Your password reset token is here!
    //     \n\n
    //     <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset<a/>`),
    // });
    // https://www.oodlestechnologies.com/blogs/Sending-EMail-through-Postmark-in-Node-JS./

    const sentEmail = await client.sendEmailWithTemplate({
      From: 'info@mindhive.science',
      To: authEmail.email,
      TemplateAlias: 'password-reset',
      TemplateModel: {
        action_url: `${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}`,
        support_url: `${process.env.FRONTEND_URL}/support`,
        product_name: 'mindHIVE',
      },
    });
    // console.log('sentEmail', sentEmail);

    // client.sendEmail({
    //   From: 'info@mindhive.science',
    //   To: authEmail.email,
    //   Subject: 'Password recovery',
    //   TextBody: 'Hello from Postmark!',
    //   HtmlBody: makeEmail(`Your password reset token is here!
    //       \n\n
    //       <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset<a/>`),
    // });

    // TemplateAlias: 'password-reset',
    // TemplateModel: {
    //   name: 'John Smith',
    //   product_name: 'mindHive platform',
    //   operating_system: 'operating_system',
    //   browser_name: 'browser_name',
    //   action_url: `${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}`,
    // },
    // Subject: 'Password recovery',
    // TextBody: 'Hello from Postmark!',
    // HtmlBody: makeEmail(`Your password reset token is here!
    //     \n\n
    //     <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset<a/>`),

    // const mailResponse = await transport.sendMail({
    //   from: 'mindhive@mindhive.com',
    //   to: authEmail.email,
    //   subject: 'Your password reset token',
    //   html: makeEmail(`Your password reset token is here!
    //     \n\n
    //     <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset<a/>`),
    // });
    // const mailResponse = await transport.sendMail({
    //   from: 'mindhive@mindhive.com',
    //   to: authEmail.email,
    //   subject: 'Your password reset token',
    //   html: makeEmail(`Your password reset token is here!
    //     \n\n
    //     <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset<a/>`),
    // });

    return { message: 'Thanks' };
  },

  async resetPassword(parent, args, ctx, info) {
    // 1. Check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error('Your passwords do not match!');
    }
    // 2. Check if the reset token is legit
    // 3. Check if it is expired
    const [authEmail] = await ctx.db.query.authEmails({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now - 1000 * 60 * 60, // 1 hour
      },
    });
    if (!authEmail) {
      throw new Error('This token is either invalid or expired.');
    }
    // 4. Hash new password
    const password = await bcrypt.hash(args.password, 10);
    // 5. Save new password, remove old reset token fields
    const updatedAuthEmail = await ctx.db.mutation.updateAuthEmail(
      {
        where: {
          email: authEmail.email,
        },
        data: {
          password,
          resetToken: null,
          resetTokenExpiry: null,
        },
      },
      `{ id profile {id} }`
    );
    // 6. Find a profile
    const profile = await ctx.db.query.profile(
      {
        where: {
          id: updatedAuthEmail.profile.id,
        },
      },
      info
    );

    // 7. Generate JWT
    const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
    // 8. Set the JWT cookie
    // const settings = checkSafari(ctx.request.headers['user-agent']);
    // ctx.response.cookie('token', token, settings);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // 8. Return the new user
    return profile;
  },

  // sign up a new user with token authentication identity
  async tokenSignUp(parent, args, ctx, info) {
    args.token = args.token.toLowerCase(); // lower case token
    args.username = args.username.toLowerCase(); // lower case username
    if (args.email) {
      args.email = args.email.toLowerCase(); // lower case username
    } else {
      args.email = null;
    }
    // TODO: if the user does not have a profile, create a profile (which will have the email auth identity)
    // create a profile (which will have the token auth identity)
    const profile = await ctx.db.mutation.createProfile(
      {
        data: {
          username: args.username,
          permissions: { set: ['PARTICIPANT'] },
        },
      },
      `{ id }`
    );

    // create a token authentication identity
    const authToken = await ctx.db.mutation.createAuthToken(
      {
        data: {
          token: args.token,
          email: args.email,
          profile: {
            connect: {
              id: profile.id,
            },
          },
        },
      },
      `{ id }`
    );
    console.log('created auth token identity');
    // connect the token auth identity to profile
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          authToken: {
            connect: {
              id: authToken.id,
            },
          },
        },
        where: {
          id: profile.id,
        },
      },
      `{ id username permissions }`
    );

    // create the JWT token for user
    const token = jwt.sign(
      { userId: updatedProfile.id },
      process.env.APP_SECRET
    );

    // set the jwt as a cookie on response
    // const settings = checkSafari(ctx.request.headers['user-agent']);
    // console.log('settings', settings);
    // ctx.response.cookie('token', token, settings);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // return user
    return updatedProfile;
  },

  async tokenLogin(parent, args, ctx, info) {
    args.username = args.username.toLowerCase(); // lower case token

    // 1. Check if there is a token auth identity with that token
    // const authToken = await ctx.db.query.authToken(
    //   {
    //     where: { token: args.token },
    //   },
    //   `{ id token profile {id} }`
    // );
    //
    // if (!authToken) {
    //   throw new Error(`No such user found for token ${args.token}`);
    // }
    // 2. Find the profile which has this auth identity
    const profile = await ctx.db.query.profile(
      {
        where: {
          username: args.username,
        },
      },
      info
    );
    // const profile = await ctx.db.query.profile(
    //   {
    //     where: {
    //       id: authToken.profile.id,
    //     },
    //   },
    //   info
    // );
    // 3. Generate the JWT token
    const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
    // 4. Set the cookie with the token
    // const isSafari = checkSafari(ctx.request.headers['user-agent']);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // 5. Return the user
    return profile;
  },

  // send the username to the email address (if it is in the participants database)
  async sendParticipantUsername(parent, args, ctx, info) {
    // 1. Check if it is a real participant
    const email = args.email.toLowerCase(); // lower case username
    const authToken = await ctx.db.query.authToken({
      where: { email },
    });
    if (!authToken) {
      throw new Error(
        `There is no participant with the email address ${args.email}`
      );
    }

    // 2. Get the username of the participant
    const profiles = await ctx.db.query.profiles(
      {
        where: {
          authToken_some: {
            id: authToken.id,
          },
        },
      },
      `{id username}`
    );
    const usernames = profiles.map(profile => profile.username);

    // 3. Email the user the usernames
    const sentEmail = await client.sendEmailWithTemplate({
      From: 'info@mindhive.science',
      To: args.email,
      TemplateAlias: 'username-reset',
      TemplateModel: {
        action_url: `${process.env.FRONTEND_URL}/login/token`,
        support_url: `${process.env.FRONTEND_URL}/support`,
        product_name: 'mindHIVE',
        username: usernames[0],
      },
    });

    // await transport.sendMail({
    //   from: 'mindhive@mindhive.com',
    //   to: args.email,
    //   subject: 'Your username in mindHive',
    //   html: makeEmail(`Your username is
    //     \n\n
    //     ${usernames[0]}
    //     \n\n
    //     <a href="${process.env.FRONTEND_URL}/login/token">Click here to log in<a/>`),
    // });

    return { message: 'Thanks' };
  },

  // sign up a new user with invite authentication identity
  async inviteSignUp(parent, args, ctx, info) {
    console.log('starting invite sign up');

    args.username = args.username.toLowerCase(); // lower case username

    // TODO: if the user does not have a profile, create a profile (which will have the invite auth identity)
    // create a profile (which will get the invite auth identity)
    const profile = await ctx.db.mutation.createProfile(
      {
        data: {
          permissions: { set: ['STUDENT'] },
          username: args.username,
          image: args.image,
          largeImage: args.largeImage,
          info: args.info,
        },
      },
      `{ id }`
    );

    // create an invite authentication identity
    const authInvite = await ctx.db.mutation.createAuthInvite(
      {
        data: {
          invitedIn: {
            connect: {
              id: args.invitedIn,
            },
          },
          profile: {
            connect: {
              id: profile.id,
            },
          },
        },
      },
      `{ id }`
    );
    console.log('created auth invite identity');
    // connect the invite auth identity to profile
    // TODO connect the student to the class - make the student the member of the class
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          authInvite: {
            connect: {
              id: authInvite.id,
            },
          },
          studentIn: {
            connect: {
              id: args.invitedIn,
            },
          },
        },
        where: {
          id: profile.id,
        },
      },
      `{ id username permissions }`
    );

    // create the JWT token for user
    const token = jwt.sign(
      { userId: updatedProfile.id },
      process.env.APP_SECRET
    );
    // set the jwt as a cookie on response
    // const isSafari = checkSafari(ctx.request.headers['user-agent']);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // return user
    return updatedProfile;
  },

  async inviteLogin(parent, args, ctx, info) {
    args.username = args.username.toLowerCase(); // lower case username

    // 1. Check whether there is a profile with that username
    const profile = await ctx.db.query.profile(
      {
        where: {
          username: args.username,
        },
      },
      `{ id username permissions authInvite { id invitedIn {id} } }`
    );

    // throw error if there is no user with the provided username
    if (!profile) {
      throw new Error(`No such user found for username ${args.username}`);
    }

    // 2. Check whether the profile has an invitation and it matches the invitation that provided in login
    // throw error if there is no invitations for this user exist
    if (!profile.authInvite.length) {
      throw new Error(`No invitations found for ${args.username}`);
    }
    const hosts = profile.authInvite.map(invite => invite.invitedIn.id);
    console.log('hosts', hosts, args.invitedIn);

    // throw error if there is the name of the host is wrong
    if (!hosts.includes(args.invitedIn)) {
      throw new Error(
        `No invitations from the chosen host found for ${args.username}`
      );
    }

    // 3. If there was no errors then generate the JWT token
    const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
    // 4. Set the cookie with the token
    // const isSafari = checkSafari(ctx.request.headers['user-agent']);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // Return the user
    return profile;
  },
};

module.exports = authMutations;
