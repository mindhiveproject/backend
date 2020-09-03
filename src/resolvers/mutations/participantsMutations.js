const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const postmark = require('postmark');

const client = new postmark.Client(process.env.MAIL_POSTMARK_CLIENT);
const { transport, makeEmail } = require('../../mail');

const participantsMutations = {
  // login for participants
  async participantLogin(parent, args, ctx, info) {
    console.log('162 args participantLogin', args);

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

    // join a study if there is a study to join (user, study are present in the args)
    if (args.study && args.user) {
      // do not update the info, if it is already there
      // TODO - create a special method to update consent, but do not update for accidental reason
      // const information = { [args.study.id]: args.user, ...profile.info };
      // console.log('information', information);
      // const generalInformation = {
      //   zipCode: args.user && args.user.zipCode,
      //   age: args.user && args.user.age,
      //   under18: args.user && args.user.under18,
      //   englishComprehension: args.user && args.user.englishComprehension,
      //   sharePersonalDataWithOtherStudies:
      //     args.user && args.user.sharePersonalDataWithOtherStudies,
      // };
      const generalInfo = { ...args.info, ...args.user };
      console.log('generalInfo', generalInfo);

      const studyInformation = {
        ...profile.studiesInfo,
        [args.study.id]: args.user,
      };
      const consentId =
        (args.user.consentGiven &&
          args.study.consent &&
          args.study.consent.length &&
          args.study.consent[0].id) ||
        null;
      const consentInformation = {
        ...profile.consentsInfo,
        [consentId]: {
          saveCoveredConsent: args.user.saveCoveredConsent,
        },
      };

      await ctx.db.mutation.updateProfile(
        {
          data: {
            participantIn: {
              connect: {
                id: args.study.id,
              },
            },
            generalInfo,
            studiesInfo: studyInformation,
            consentsInfo: consentInformation,
            consentGivenFor: consentId
              ? {
                  connect: { id: consentId },
                }
              : null,
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

  async emailMyStudyParticipants(parent, args, ctx, info) {
    const { where } = args;
    const mystudy = await ctx.db.query.study(
      { where },
      `{ id title author {id} collaborators {id}}`
    );

    const ownsStudy = mystudy.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    let collaboratorInStudy;
    if (mystudy.collaborators) {
      const collaboratorsIds = mystudy.collaborators.map(
        collaborator => collaborator.id
      );
      collaboratorInStudy = collaboratorsIds.includes(ctx.request.userId);
    }

    if (!ownsStudy && !hasPermissions && !collaboratorInStudy) {
      throw new Error(`You don't have permission to do that!`);
    }

    const study = await ctx.db.query.study(
      { where },
      `{ id participants { authEmail {email} } }`
    );

    const emails = study.participants
      .filter(
        participant =>
          participant.authEmail &&
          participant.authEmail.length &&
          participant.authEmail[0] &&
          participant.authEmail[0].email
      )
      .map(participant => participant.authEmail[0].email);

    const messages = emails.map(email => ({
      From: 'info@mindhive.science',
      To: email,
      TemplateAlias: 'welcome-1',
      TemplateModel: {
        task_name: 'New test test',
        username: args.username,
        action_url: `${process.env.FRONTEND_URL}/study/all`,
        login_url: `${process.env.FRONTEND_URL}/login`,
        support_url: `${process.env.FRONTEND_URL}/support`,
        product_name: 'MindHive',
        support_email: 'info@mindhive.science',
        help_url: `${process.env.FRONTEND_URL}/help/participants`,
      },
    }));

    console.log('emails', emails);
    console.log('args.info', args.info);
    // const sentEmail = await client.sendEmailBatchWithTemplates(messages);
    return { message: 'You emailed your participants!' };
  },

  // async participantConfirmEmail(parent, args, ctx, info) {
  //   const authParticipant = await ctx.db.query.authParticipant(
  //     {
  //       where: { email: args.email },
  //     },
  //     `{ settings }`
  //   );
  //   if (!authParticipant) {
  //     throw new Error(`There is no user with the email address ${args.email}`);
  //   }
  //
  //   if (authParticipant.settings.emailConfirmation.confirmed) {
  //     return { message: 'OK' };
  //   }
  //
  //   if (
  //     authParticipant.settings.emailConfirmation.token !==
  //     args.confirmationToken
  //   ) {
  //     throw new Error('Your confirmation email is either invalid or expired.');
  //   }
  //
  //   // perhaps, set Permission to Participant here, or update it to a higher permission
  //
  //   const res = await ctx.db.mutation.updateAuthParticipant({
  //     where: {
  //       email: args.email,
  //     },
  //     data: {
  //       settings: {
  //         emailConfirmation: {
  //           token: null,
  //           tokenExpiry: null,
  //           confirmed: true,
  //         },
  //       },
  //     },
  //   });
  //
  //   return { message: 'OK' };
  // },
};

module.exports = participantsMutations;
