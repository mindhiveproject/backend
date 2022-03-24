const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const postmark = require('postmark');

const client = new postmark.Client(process.env.MAIL_POSTMARK_CLIENT);
const { OAuth2Client } = require('google-auth-library');
const uniqid = require('uniqid');
const generate = require('project-name-generator');
const { transport, makeEmail } = require('../../mail');

// general function to join a study
const joinTheStudy = async (profile, args, ctx, info) => {
  const { study } = args;
  // assign participants to one of the study blocks
  const updatedInfo = { ...args.info };
  if (study.components && study.components.blocks) {
    const { blocks } = study.components;
    const activeBlocks = blocks.filter(b => !b.skip);
    // get a random block out of study between-subjects blocks
    const block = activeBlocks[Math.floor(Math.random() * activeBlocks.length)];
    updatedInfo.blockId = block.blockId;
    updatedInfo.blockName = block.title;
  }
  const studyInformation = {
    ...profile.studiesInfo,
    [study.id]: updatedInfo,
  };

  // update consent information
  const consentIds = Object.keys(updatedInfo)
    .filter(key => key.startsWith('consent-'))
    .map(key => key.split('-')[1])
    .map(id => ({ id }));

  // filter the consents where the participant has agreed
  const consentIdsAgree = consentIds.filter(
    consent => updatedInfo[`consent-${consent.id}`] === 'agree'
  );

  let consentInformation;
  if (consentIds && consentIds.length) {
    consentInformation = {
      ...profile.consentsInfo,
      ...Object.fromEntries(
        consentIds.map(consent => [
          consent.id,
          {
            saveCoveredConsent: 'true',
            decision: updatedInfo[`consent-${consent.id}`],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ])
      ),
    };
  } else {
    consentInformation = {
      ...profile.consentsInfo,
    };
  }

  // update general preference of participant
  const generalInfo = {
    ...profile.generalInfo,
    ...args.info,
  };
  delete generalInfo.id;
  delete generalInfo.step;
  delete generalInfo.mode;
  delete generalInfo.covered;
  delete generalInfo.numberOfConsents;
  delete generalInfo.activeConsent;

  const updatedProfile = await ctx.db.mutation.updateProfile(
    {
      data: {
        participantIn: {
          connect: {
            id: study.id,
          },
        },
        studiesInfo: studyInformation,
        consentsInfo: consentInformation,
        consentGivenFor:
          consentIdsAgree && consentIdsAgree.length
            ? {
                connect: consentIdsAgree,
              }
            : null,
        generalInfo,
      },
      where: {
        id: profile.id,
      },
    },
    info
  );

  return updatedProfile;
};

const authMutations = {
  // general sign up flow
  async signUp(parent, args, ctx, info) {
    // whether the private email address is used
    const privateAddress = !(args.info && args.info.useTeacherEmail);

    args.username = args.username.toLowerCase().trim(); // lower case username
    if (args.email && privateAddress) {
      args.email = args.email.toLowerCase().trim(); // lower case email
    } else {
      args.email = null;
    }

    // create a unique public Id
    args.publicId = uniqid();

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
          `Email ${args.email} is taken. Already have an account? Login at https://mindhive.science/login.`
        );
      }
    }

    // hash the password
    const password = await bcrypt.hash(args.password, 10);

    // merge all the information about the user
    const generalInfo = { ...args.info, ...args.user, data: 'science' };
    delete generalInfo.id;
    delete generalInfo.step;
    delete generalInfo.mode;
    // delete generalInfo.consent;
    delete generalInfo.covered;

    // create a profile (which will have the participant auth identity)
    // save general information about the person
    const profile = await ctx.db.mutation.createProfile(
      {
        data: {
          username: args.username,
          publicId: args.publicId,
          permissions: { set: args.permissions },
          generalInfo,
          publicReadableId: generate({ words: 3, number: false }).dashed,
        },
      },
      info
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
    let updatedProfile = await ctx.db.mutation.updateProfile(
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
      info
    );

    // join a study if there is a study
    if (args.study) {
      updatedProfile = await joinTheStudy(updatedProfile, args, ctx, info);
    }

    // join a class if there is a class in args.class
    if (args.class && args.class.code) {
      updatedProfile = await ctx.db.mutation.updateProfile(
        {
          data: {
            studentIn: args.permissions.includes('STUDENT')
              ? {
                  connect: {
                    code: args.class.code,
                  },
                }
              : null,
            mentorIn: args.permissions.includes('MENTOR')
              ? {
                  connect: {
                    code: args.class.code,
                  },
                }
              : null,
          },
          where: {
            id: profile.id,
          },
        },
        info
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
    // TODO remove false later!
    if (true && privateAddress && args.email) {
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
          product_name: 'MindHive',
          support_email: 'info@mindhive.science',
          help_url: `${process.env.FRONTEND_URL}/help/participants`,
        },
      });
    }

    // return user
    return updatedProfile;
  },

  // sign up with Google
  async serviceSignUp(parent, args, ctx, info) {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const googleClient = new OAuth2Client(clientID);
    const ticket = await googleClient.verifyIdToken({
      idToken: args.token,
      audience: clientID, // Specify the CLIENT_ID of the app that accesses the backend
    });
    const payload = await ticket.getPayload();

    args.username = payload.name.toLowerCase().trim(); // lower case username
    if (payload.email) {
      args.email = payload.email.toLowerCase().trim(); // lower case username
    } else {
      args.email = null;
    }

    // create a unique public Id
    args.publicId = uniqid();

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
          `Email ${args.email} is already taken. If you have an account, please log in.`
        );
      }
    }

    // hash the password
    const password = await bcrypt.hash(args.token, 10);

    const generalInfo = { ...args.info, ...args.user, data: 'science' };
    delete generalInfo.id;
    delete generalInfo.step;
    delete generalInfo.mode;
    delete generalInfo.consent;
    delete generalInfo.covered;

    // create a profile (which will have the participant auth identity)
    const profile = await ctx.db.mutation.createProfile(
      {
        data: {
          username: args.username,
          publicId: args.publicId,
          permissions: { set: args.permissions },
          generalInfo,
          publicReadableId: generate({ words: 3, number: false }).dashed,
        },
      },
      info
    );

    // TODO create a social account authentication identity
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
          settings: {
            googleAuth: payload,
          },
        },
      },
      `{ id }`
    );
    // connect the participant auth identity to profile
    let updatedProfile = await ctx.db.mutation.updateProfile(
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
      info
    );

    // join a study if there is a study
    if (args.study) {
      updatedProfile = await joinTheStudy(updatedProfile, args, ctx, info);
    }

    // join a class if there is a class in args.class
    if (args.class && args.class.code) {
      updatedProfile = await ctx.db.mutation.updateProfile(
        {
          data: {
            studentIn: args.permissions.includes('STUDENT')
              ? {
                  connect: {
                    code: args.class.code,
                  },
                }
              : null,
            mentorIn: args.permissions.includes('MENTOR')
              ? {
                  connect: {
                    code: args.class.code,
                  },
                }
              : null,
          },
          where: {
            id: profile.id,
          },
        },
        info
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
    // return user
    return updatedProfile;
  },

  // general login for everyone with username or password
  async login(parent, args, ctx, info) {
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

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'You are signed out!' };
  },

  async requestReset(parent, args, ctx, info) {
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

  async serviceLogin(parent, args, ctx, info) {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const googleClient = new OAuth2Client(clientID);
    const ticket = await googleClient.verifyIdToken({
      idToken: args.token,
      audience: clientID, // Specify the CLIENT_ID of the app that accesses the backend
    });
    const payload = await ticket.getPayload();

    args.username = payload.name.toLowerCase().trim(); // lower case username
    if (payload.email) {
      args.email = payload.email.toLowerCase().trim(); // lower case username
    } else {
      args.email = null;
    }

    let profile;
    profile = await ctx.db.query.profile(
      {
        where: {
          username: args.username,
        },
      },
      `{ id username permissions studiesInfo consentsInfo }`
    );

    if (!profile && args.email) {
      const authEmail = await ctx.db.query.authEmail(
        {
          where: { email: args.email },
        },
        `{ id password profile { id username permissions studiesInfo consentsInfo } }`
      );
      if (!authEmail) {
        throw new Error(`No user profile found! Please sign up first.`);
      }
      profile = authEmail.profile;
    }

    if (!profile) {
      throw new Error(`No user profile found! Please sign up first.`);
    }

    // join a study if there is a study
    if (args.study) {
      profile = await joinTheStudy(profile, args, ctx, info);
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

  // login for participants
  async participantLogin(parent, args, ctx, info) {
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
      `{ id username authEmail { id password } permissions studiesInfo consentsInfo }`
    );
    // if there is no profile found, try login as an email
    if (!profile) {
      const authEmail = await ctx.db.query.authEmail(
        {
          where: { email: args.usernameEmail },
        },
        `{ id password profile { id username permissions studiesInfo consentsInfo } }`
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

    // join a study if there is a study
    if (args.study) {
      profile = await joinTheStudy(profile, args, ctx, info);
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

  // join the study (for participants)
  async joinStudy(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    let profile = await ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      `{ id info studiesInfo consentsInfo generalInfo }`
    );
    // join a study if there is a study
    if (args.study) {
      profile = await joinTheStudy(profile, args, ctx, info);
    }
    return profile;
  },

  // edit account information
  async editAccount(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    // update profile
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          username: args.username,
          generalInfo: { ...args.info },
          isPublic: args.isPublic,
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id authEmail{ id } }`
    );

    // if there is an email or password
    if (args.email || args.password) {
      // find the authEmail id
      const authEmailId =
        updatedProfile.authEmail.length && updatedProfile.authEmail[0].id;
      if (authEmailId) {
        const updatedData = {};

        if (args.email) {
          updatedData.email = args.email;
        }
        if (args.password) {
          updatedData.password = await bcrypt.hash(args.password, 10);
        }

        // update email
        await ctx.db.mutation.updateAuthEmail(
          {
            data: {
              ...updatedData,
            },
            where: {
              id: authEmailId,
            },
          },
          `{ id email }`
        );
      }
    }

    return updatedProfile;
  },

  // join the study as a guest
  async joinStudyAsGuest(parent, args, ctx, info) {
    const { study } = args;

    // assign participants to one of the study blocks
    const updatedInfo = { ...args.info };

    if (study.components && study.components.blocks) {
      const { blocks } = study.components;
      const activeBlocks = blocks.filter(b => !b.skip);
      // get a random block out of study between-subjects blocks
      const block =
        activeBlocks[Math.floor(Math.random() * activeBlocks.length)];
      updatedInfo.blockId = block.blockId;
      updatedInfo.blockName = block.title;
    }

    const studyInformation = {
      [study.id]: updatedInfo,
    };

    // update consent information
    const consentIds = Object.keys(updatedInfo)
      .filter(key => key.startsWith('consent-'))
      .map(key => key.split('-')[1])
      .map(id => ({ id }));

    let consentInformation;
    if (consentIds && consentIds.length) {
      consentInformation = {
        ...Object.fromEntries(
          consentIds.map(consent => [
            consent.id,
            {
              saveCoveredConsent: 'true',
              decision: updatedInfo[`consent-${consent.id}`],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ])
        ),
      };
    } else {
      consentInformation = {};
    }

    // update general preference of participant
    const generalInfo = {
      ...args.info,
    };
    delete generalInfo.id;
    delete generalInfo.step;
    delete generalInfo.mode;
    delete generalInfo.covered;
    delete generalInfo.numberOfConsents;
    delete generalInfo.activeConsent;

    const guest = await ctx.db.mutation.createGuest(
      {
        data: {
          publicId: uniqid(),
          publicReadableId: generate({ words: 3, number: false }).dashed,
          guestParticipantIn: {
            connect: {
              id: study.id,
            },
          },
          studiesInfo: studyInformation,
          consentsInfo: consentInformation,
          generalInfo,
        },
      },
      info
    );

    return guest;
  },
};

module.exports = authMutations;
