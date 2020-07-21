const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const postmark = require('postmark');

const client = new postmark.Client(process.env.MAIL_POSTMARK_CLIENT);
const { transport, makeEmail } = require('../../mail');

const authMutations = {
  // general login for everyone with username or password
  async login(parent, args, ctx, info) {
    console.log('args', args);
    if (args.usernameEmail) {
      args.usernameEmail = args.usernameEmail.toLowerCase().trim();
    } else {
      throw new Error(`Invalid login details!`);
    }
    let profile;
    let storedPassword;
    profile = await ctx.db.query.profile(
      {
        where: {
          username: args.usernameEmail,
        },
      },
      `{ id username authEmail { id password } permissions }`
    );
    // if there is no profile found, try login as an email
    if (!profile) {
      const authEmail = await ctx.db.query.authEmail(
        {
          where: { email: args.usernameEmail },
        },
        `{ id password profile { id username permissions } }`
      );
      if (!authEmail) {
        throw new Error(`No such user found for ${args.usernameEmail}`);
      }
      profile = authEmail.profile;
      storedPassword = authEmail.password;
    } else {
      storedPassword = profile.authEmail[0].password;
    }

    // check password
    const valid = await bcrypt.compare(args.password, storedPassword);
    if (!valid) {
      throw new Error(`Invalid password!`);
    }

    const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // return the user
    return profile;
  },

  async signUp(parent, args, ctx, info) {
    console.log('signUp args', args);

    const privateAddress = !(args.info && args.info.useTeacherEmail);
    console.log('privateAddress', privateAddress);

    args.username = args.username.toLowerCase().trim(); // lower case username
    if (args.email && privateAddress) {
      args.email = args.email.toLowerCase().trim(); // lower case username
    } else {
      args.email = null;
    }

    // check whether the email is already in the system
    if (args.email) {
      const existingEmail = await ctx.db.query.authEmail(
        {
          where: { email: args.email },
        },
        `{ id }`
      );
      if (existingEmail) {
        throw new Error(
          `Email ${args.email} is taken. Already have an account? Login here.`
        );
      }
    }

    // hash the password
    const password = await bcrypt.hash(args.password, 10);

    // create a profile (which will have the participant auth identity)
    const profile = await ctx.db.mutation.createProfile(
      {
        data: {
          username: args.username,
          permissions: { set: args.permissions },
          info: { general: args.info },
        },
      },
      `{ id }`
    );

    // create an email authentication identity
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
    // connect the participant auth identity to profile
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
      `{ id username permissions info}`
    );

    // join a study if there is a study to join (user, study are present in the args)
    if (args.study && args.user) {
      const information = {
        ...updatedProfile.info,
        [args.study.id]: args.user,
      };
      await ctx.db.mutation.updateProfile(
        {
          data: {
            participantIn: {
              connect: {
                id: args.study.id,
              },
            },
            info: information,
          },
          where: {
            id: profile.id,
          },
        },
        `{ id username permissions }`
      );
    }

    // join a class if there is a class in args.class
    if (args.class && args.class.code) {
      await ctx.db.mutation.updateProfile(
        {
          data: {
            studentIn: {
              connect: {
                code: args.class.code,
              },
            },
          },
          where: {
            id: profile.id,
          },
        },
        `{ id username permissions }`
      );
    }

    // create the JWT token for user
    const token = jwt.sign(
      { userId: updatedProfile.id },
      process.env.APP_SECRET
    );
    // set the jwt as a cookie on response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });

    // send confirmation email
    if (privateAddress && args.email) {
      const randomBytesPromise = promisify(randomBytes);
      const confirmationToken = (await randomBytesPromise(25)).toString('hex');
      const confirmationTokenExpiry = Date.now() + 1000 * 60 * 60 * 24; // 24 hour

      const res = await ctx.db.mutation.updateAuthEmail({
        where: {
          email: args.email,
        },
        data: {
          settings: {
            emailConfirmation: {
              token: confirmationToken,
              tokenExpiry: confirmationTokenExpiry,
            },
          },
        },
      });

      const sentEmail = await client.sendEmailWithTemplate({
        From: 'info@mindhive.science',
        To: args.email,
        TemplateAlias: 'welcome',
        TemplateModel: {
          username: args.username,
          action_url: `${process.env.FRONTEND_URL}/confirm/email?e=${args.email}&t=${confirmationToken}`,
          login_url: `${process.env.FRONTEND_URL}/login`,
          support_url: `${process.env.FRONTEND_URL}/support`,
          product_name: 'mindHIVE',
          support_email: 'info@mindhive.science',
          help_url: `${process.env.FRONTEND_URL}/help/participants`,
        },
      });
      console.log('sentEmail', sentEmail);
    }

    // return user
    return updatedProfile;
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'You are signed out!' };
  },

  async requestReset(parent, args, ctx, info) {
    console.log('args', args);
    // Find the profile either by using username or email
    // 1. Assume that usernameEmail is the username and search for the user
    let dedicatedEmail;
    let authEmailId;

    const profile = await ctx.db.query.profile(
      {
        where: {
          username: args.usernameEmail,
        },
      },
      `{ id authEmail { id email } studentIn { creator { authEmail { email }}} }`
    );

    if (!profile) {
      console.log('No profile found');
      const authEmail = await ctx.db.query.authEmail(
        {
          where: { email: args.usernameEmail },
        },
        `{ id email }`
      );
      if (!authEmail) {
        throw new Error(`There is no user matching ${args.usernameEmail}`);
      } else {
        dedicatedEmail = authEmail.email;
        authEmailId = authEmail.id;
      }
    } else {
      authEmailId = profile.authEmail[0].id;
      if (profile.authEmail[0] && profile.authEmail[0].email) {
        dedicatedEmail = profile.authEmail[0].email;
      } else if (
        profile.studentIn[0] &&
        profile.studentIn[0].creator &&
        profile.studentIn[0].creator.authEmail[0] &&
        profile.studentIn[0].creator.authEmail[0].email
      ) {
        dedicatedEmail = profile.studentIn[0].creator.authEmail[0].email;
      }
    }

    console.log('dedicatedEmail', dedicatedEmail);
    console.log('authEmailId', authEmailId);

    // 1. Check if it is a real user

    // 2. Set a reset token and expiry on that user
    const randomBytesPromise = promisify(randomBytes);
    const resetToken = (await randomBytesPromise(25)).toString('hex');
    const resetTokenExpiry = Date.now() + 1000 * 60 * 60; // 1 hour
    const res = await ctx.db.mutation.updateAuthEmail({
      where: {
        id: authEmailId,
      },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });
    //
    const sentEmail = await client.sendEmailWithTemplate({
      From: 'info@mindhive.science',
      To: dedicatedEmail,
      TemplateAlias: 'password-reset',
      TemplateModel: {
        action_url: `${process.env.FRONTEND_URL}/reset?t=${resetToken}`,
        support_url: `${process.env.FRONTEND_URL}/support`,
        product_name: 'MindHive',
      },
    });

    return { message: 'Thanks' };
  },

  async resetPassword(parent, args, ctx, info) {
    // 1. Check if the passwords match
    console.log('args', args);
    if (args.password !== args.confirmPassword) {
      throw new Error('Your passwords do not match!');
    }
    // 2. Check if the reset token is legit
    // 3. Check if it is expired
    const [authEmail] = await ctx.db.query.authEmails(
      {
        where: {
          resetToken: args.resetToken,
          resetTokenExpiry_gte: Date.now - 1000 * 60 * 60, // 1 hour
        },
      },
      `{ id }`
    );
    if (!authEmail) {
      throw new Error('This token is either invalid or expired.');
    }
    console.log('authEmail', authEmail);
    // 4. Hash new password
    const password = await bcrypt.hash(args.password, 10);
    // 5. Save new password, remove old reset token fields
    const updatedAuthEmail = await ctx.db.mutation.updateAuthEmail(
      {
        where: {
          id: authEmail.id,
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

  async confirmEmail(parent, args, ctx, info) {
    const authEmail = await ctx.db.query.authEmail(
      {
        where: { email: args.email },
      },
      `{ settings }`
    );
    if (!authEmail) {
      throw new Error(`There is no user with the email address ${args.email}`);
    }

    if (authEmail.settings.emailConfirmation.confirmed) {
      return { message: 'OK' };
    }

    if (authEmail.settings.emailConfirmation.token !== args.confirmationToken) {
      throw new Error('Your confirmation email is either invalid or expired.');
    }

    // perhaps, set Permission to Participant here, or update it to a higher permission

    const res = await ctx.db.mutation.updateAuthEmail({
      where: {
        email: args.email,
      },
      data: {
        settings: {
          emailConfirmation: {
            token: null,
            tokenExpiry: null,
            confirmed: true,
          },
        },
      },
    });

    return { message: 'OK' };
  },

  // sign up a new user with token authentication identity
  // async tokenSignUp(parent, args, ctx, info) {
  //   args.token = args.token.toLowerCase(); // lower case token
  //   args.username = args.username.toLowerCase(); // lower case username
  //   if (args.email) {
  //     args.email = args.email.toLowerCase(); // lower case username
  //   } else {
  //     args.email = null;
  //   }
  //   // TODO: if the user does not have a profile, create a profile (which will have the email auth identity)
  //   // create a profile (which will have the token auth identity)
  //   const profile = await ctx.db.mutation.createProfile(
  //     {
  //       data: {
  //         username: args.username,
  //         permissions: { set: ['PARTICIPANT'] },
  //       },
  //     },
  //     `{ id }`
  //   );
  //
  //   // create a token authentication identity
  //   const authToken = await ctx.db.mutation.createAuthToken(
  //     {
  //       data: {
  //         token: args.token,
  //         email: args.email,
  //         profile: {
  //           connect: {
  //             id: profile.id,
  //           },
  //         },
  //       },
  //     },
  //     `{ id }`
  //   );
  //   console.log('created auth token identity');
  //   // connect the token auth identity to profile
  //   const updatedProfile = await ctx.db.mutation.updateProfile(
  //     {
  //       data: {
  //         authToken: {
  //           connect: {
  //             id: authToken.id,
  //           },
  //         },
  //       },
  //       where: {
  //         id: profile.id,
  //       },
  //     },
  //     `{ id username permissions }`
  //   );
  //
  //   // create the JWT token for user
  //   const token = jwt.sign(
  //     { userId: updatedProfile.id },
  //     process.env.APP_SECRET
  //   );
  //
  //   // set the jwt as a cookie on response
  //   // const settings = checkSafari(ctx.request.headers['user-agent']);
  //   // console.log('settings', settings);
  //   // ctx.response.cookie('token', token, settings);
  //   ctx.response.cookie('token', token, {
  //     httpOnly: true,
  //     maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  //     sameSite: 'Strict',
  //     secure: process.env.NODE_ENV === 'production',
  //   });
  //   // return user
  //   return updatedProfile;
  // },
  //
  // async tokenLogin(parent, args, ctx, info) {
  //   args.username = args.username.toLowerCase(); // lower case token
  //
  //   // 2. Find the profile which has this auth identity
  //   const profile = await ctx.db.query.profile(
  //     {
  //       where: {
  //         username: args.username,
  //       },
  //     },
  //     info
  //   );
  //   // 3. Generate the JWT token
  //   const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
  //   // 4. Set the cookie with the token
  //   // const isSafari = checkSafari(ctx.request.headers['user-agent']);
  //   ctx.response.cookie('token', token, {
  //     httpOnly: true,
  //     maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  //     sameSite: 'Strict',
  //     secure: process.env.NODE_ENV === 'production',
  //   });
  //   // 5. Return the user
  //   return profile;
  // },

  // send the username to the email address (if it is in the participants database)
  // async sendParticipantUsername(parent, args, ctx, info) {
  //   // 1. Check if it is a real participant
  //   const email = args.email.toLowerCase(); // lower case username
  //   const authToken = await ctx.db.query.authToken({
  //     where: { email },
  //   });
  //   if (!authToken) {
  //     throw new Error(
  //       `There is no participant with the email address ${args.email}`
  //     );
  //   }
  //
  //   // 2. Get the username of the participant
  //   const profiles = await ctx.db.query.profiles(
  //     {
  //       where: {
  //         authToken_some: {
  //           id: authToken.id,
  //         },
  //       },
  //     },
  //     `{id username}`
  //   );
  //   const usernames = profiles.map(profile => profile.username);
  //
  //   // 3. Email the user the usernames
  //   const sentEmail = await client.sendEmailWithTemplate({
  //     From: 'info@mindhive.science',
  //     To: args.email,
  //     TemplateAlias: 'username-reset',
  //     TemplateModel: {
  //       action_url: `${process.env.FRONTEND_URL}/login/token`,
  //       support_url: `${process.env.FRONTEND_URL}/support`,
  //       product_name: 'mindHIVE',
  //       username: usernames[0],
  //     },
  //   });
  //
  //   return { message: 'Thanks' };
  // },
  //
  // // sign up a new user with invite authentication identity
  // async inviteSignUp(parent, args, ctx, info) {
  //   console.log('starting invite sign up');
  //
  //   args.username = args.username.toLowerCase(); // lower case username
  //
  //   // TODO: if the user does not have a profile, create a profile (which will have the invite auth identity)
  //   // create a profile (which will get the invite auth identity)
  //   const profile = await ctx.db.mutation.createProfile(
  //     {
  //       data: {
  //         permissions: { set: ['STUDENT'] },
  //         username: args.username,
  //         image: args.image,
  //         largeImage: args.largeImage,
  //         info: args.info,
  //       },
  //     },
  //     `{ id }`
  //   );
  //
  //   // create an invite authentication identity
  //   const authInvite = await ctx.db.mutation.createAuthInvite(
  //     {
  //       data: {
  //         invitedIn: {
  //           connect: {
  //             id: args.invitedIn,
  //           },
  //         },
  //         profile: {
  //           connect: {
  //             id: profile.id,
  //           },
  //         },
  //       },
  //     },
  //     `{ id }`
  //   );
  //   console.log('created auth invite identity');
  //   // connect the invite auth identity to profile
  //   // TODO connect the student to the class - make the student the member of the class
  //   const updatedProfile = await ctx.db.mutation.updateProfile(
  //     {
  //       data: {
  //         authInvite: {
  //           connect: {
  //             id: authInvite.id,
  //           },
  //         },
  //         studentIn: {
  //           connect: {
  //             id: args.invitedIn,
  //           },
  //         },
  //       },
  //       where: {
  //         id: profile.id,
  //       },
  //     },
  //     `{ id username permissions }`
  //   );
  //
  //   // create the JWT token for user
  //   const token = jwt.sign(
  //     { userId: updatedProfile.id },
  //     process.env.APP_SECRET
  //   );
  //   // set the jwt as a cookie on response
  //   // const isSafari = checkSafari(ctx.request.headers['user-agent']);
  //   ctx.response.cookie('token', token, {
  //     httpOnly: true,
  //     maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  //     sameSite: 'Strict',
  //     secure: process.env.NODE_ENV === 'production',
  //   });
  //   // return user
  //   return updatedProfile;
  // },
  //
  // async inviteLogin(parent, args, ctx, info) {
  //   args.username = args.username.toLowerCase(); // lower case username
  //
  //   // 1. Check whether there is a profile with that username
  //   const profile = await ctx.db.query.profile(
  //     {
  //       where: {
  //         username: args.username,
  //       },
  //     },
  //     `{ id username permissions authInvite { id invitedIn {id} } }`
  //   );
  //
  //   // throw error if there is no user with the provided username
  //   if (!profile) {
  //     throw new Error(`No such user found for username ${args.username}`);
  //   }
  //
  //   // 2. Check whether the profile has an invitation and it matches the invitation that provided in login
  //   // throw error if there is no invitations for this user exist
  //   if (!profile.authInvite.length) {
  //     throw new Error(`No invitations found for ${args.username}`);
  //   }
  //   const hosts = profile.authInvite.map(invite => invite.invitedIn.id);
  //   console.log('hosts', hosts, args.invitedIn);
  //
  //   // throw error if there is the name of the host is wrong
  //   if (!hosts.includes(args.invitedIn)) {
  //     throw new Error(
  //       `No invitations from the chosen host found for ${args.username}`
  //     );
  //   }
  //
  //   // 3. If there was no errors then generate the JWT token
  //   const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
  //   // 4. Set the cookie with the token
  //   // const isSafari = checkSafari(ctx.request.headers['user-agent']);
  //   ctx.response.cookie('token', token, {
  //     httpOnly: true,
  //     maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  //     sameSite: 'Strict',
  //     secure: process.env.NODE_ENV === 'production',
  //   });
  //   // Return the user
  //   return profile;
  // },
};

module.exports = authMutations;
