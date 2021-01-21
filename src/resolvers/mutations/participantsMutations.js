const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const postmark = require('postmark');

const client = new postmark.Client(process.env.MAIL_POSTMARK_CLIENT);
const { transport, makeEmail } = require('../../mail');

const participantsMutations = {
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
