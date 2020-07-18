const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const postmark = require('postmark');

const client = new postmark.Client(process.env.MAIL_POSTMARK_CLIENT);
const { transport, makeEmail } = require('../../mail');

const participantsMutations = {
  // this one should be deprecated, as participants sign up via a general flow
  async participantSignUp(parent, args, ctx, info) {
    // console.log('participantSignUp args', args);
    args.username = args.username.toLowerCase().trim(); // lower case username
    if (args.email) {
      args.email = args.email.toLowerCase().trim(); // lower case username
    } else {
      args.email = null;
    }

    // check whether the email is already in the system
    if (args.email) {
      const existingParticipant = await ctx.db.query.authParticipant(
        {
          where: { email: args.email },
        },
        `{ id }`
      );
      if (existingParticipant) {
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
          permissions: { set: ['PARTICIPANT'] },
          info: { general: args.info },
        },
      },
      `{ id }`
    );

    // create a participant authentication identity
    const authParticipant = await ctx.db.mutation.createAuthParticipant(
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
          authParticipant: {
            connect: {
              id: authParticipant.id,
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
    if (args.email) {
      const randomBytesPromise = promisify(randomBytes);
      const confirmationToken = (await randomBytesPromise(25)).toString('hex');
      const confirmationTokenExpiry = Date.now() + 1000 * 60 * 60 * 24; // 24 hour

      const res = await ctx.db.mutation.updateAuthParticipant({
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
          action_url: `${process.env.FRONTEND_URL}/confirm/participant?email=${args.email}&token=${confirmationToken}`,
          login_url: `${process.env.FRONTEND_URL}/login/participant`,
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

  // login for participants
  async participantLogin(parent, args, ctx, info) {
    console.log('162 args participantLogin', args);

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

    // join a study if there is a study to join (user, study are present in the args)
    if (args.study && args.user && Object.keys(args.user).length > 0) {
      // do not update the info, if it is already there
      // TODO - create a special method to update consent, but do not update for accidental reason
      const information = { [args.study.id]: args.user, ...profile.info };
      console.log('information', information);
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

    const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    return profile;
  },

  // async participantRequestReset(parent, args, ctx, info) {
  //   // 1. Check if it is a real user
  //   const authParticipant = await ctx.db.query.authParticipant({
  //     where: { email: args.email },
  //   });
  //   if (!authParticipant) {
  //     throw new Error(`There is no user with the email address ${args.email}`);
  //   }
  //   // 2. Set a reset token and expiry on that user
  //   const randomBytesPromise = promisify(randomBytes);
  //   const resetToken = (await randomBytesPromise(25)).toString('hex');
  //   const resetTokenExpiry = Date.now() + 1000 * 60 * 60; // 1 hour
  //   const res = await ctx.db.mutation.updateAuthParticipant({
  //     where: {
  //       email: args.email,
  //     },
  //     data: {
  //       resetToken,
  //       resetTokenExpiry,
  //     },
  //   });
  //
  //   const sentEmail = await client.sendEmailWithTemplate({
  //     From: 'info@mindhive.science',
  //     To: authParticipant.email,
  //     TemplateAlias: 'password-reset',
  //     TemplateModel: {
  //       action_url: `${process.env.FRONTEND_URL}/reset/participant?resetToken=${resetToken}`,
  //       support_url: `${process.env.FRONTEND_URL}/support`,
  //       product_name: 'mindHIVE',
  //     },
  //   });
  //   console.log('sentEmail', sentEmail);
  //
  //   return { message: 'Thanks' };
  // },
  //
  // async participantResetPassword(parent, args, ctx, info) {
  //   // 1. Check if the passwords match
  //   if (args.password !== args.confirmPassword) {
  //     throw new Error('Your passwords do not match!');
  //   }
  //   // 2. Check if the reset token is legit
  //   // 3. Check if it is expired
  //   const [authParticipant] = await ctx.db.query.authParticipants({
  //     where: {
  //       resetToken: args.resetToken,
  //       resetTokenExpiry_gte: Date.now - 1000 * 60 * 60, // 1 hour
  //     },
  //   });
  //   if (!authParticipant) {
  //     throw new Error('This token is either invalid or expired.');
  //   }
  //   // 4. Hash new password
  //   const password = await bcrypt.hash(args.password, 10);
  //   // 5. Save new password, remove old reset token fields
  //   const updatedAuthParticipant = await ctx.db.mutation.updateAuthParticipant(
  //     {
  //       where: {
  //         email: authParticipant.email,
  //       },
  //       data: {
  //         password,
  //         resetToken: null,
  //         resetTokenExpiry: null,
  //       },
  //     },
  //     `{ id profile {id} }`
  //   );
  //   // 6. Find a profile
  //   const profile = await ctx.db.query.profile(
  //     {
  //       where: {
  //         id: updatedAuthParticipant.profile.id,
  //       },
  //     },
  //     info
  //   );
  //
  //   // 7. Generate JWT
  //   const token = jwt.sign({ userId: profile.id }, process.env.APP_SECRET);
  //   // 8. Set the JWT cookie
  //   // const settings = checkSafari(ctx.request.headers['user-agent']);
  //   // ctx.response.cookie('token', token, settings);
  //   ctx.response.cookie('token', token, {
  //     httpOnly: true,
  //     maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  //     sameSite: 'Strict',
  //     secure: process.env.NODE_ENV === 'production',
  //   });
  //   // 8. Return the new user
  //   return profile;
  // },

  async participantConfirmEmail(parent, args, ctx, info) {
    const authParticipant = await ctx.db.query.authParticipant(
      {
        where: { email: args.email },
      },
      `{ settings }`
    );
    if (!authParticipant) {
      throw new Error(`There is no user with the email address ${args.email}`);
    }

    if (authParticipant.settings.emailConfirmation.confirmed) {
      return { message: 'OK' };
    }

    if (
      authParticipant.settings.emailConfirmation.token !==
      args.confirmationToken
    ) {
      throw new Error('Your confirmation email is either invalid or expired.');
    }

    // perhaps, set Permission to Participant here, or update it to a higher permission

    const res = await ctx.db.mutation.updateAuthParticipant({
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
};

module.exports = participantsMutations;
