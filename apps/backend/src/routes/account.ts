import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

const DeleteAccountBody = Type.Object({
  confirm: Type.Boolean(),
});

export async function accountRoutes(fastify: FastifyInstance) {
  fastify.post('/account/delete', {
    schema: { body: DeleteAccountBody },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { confirm } = request.body as { confirm: boolean };
    if (!confirm) {
      return reply.status(400).send({
        success: false,
        error: 'delete_not_confirmed',
      });
    }

    if (!fastify.supabase) {
      return reply.status(503).send({
        success: false,
        error: 'database_unavailable',
      });
    }

    const { error } = await fastify.supabase.auth.admin.deleteUser(request.userId);
    if (error) {
      fastify.log.error(error, 'Failed to delete account');
      return reply.status(500).send({
        success: false,
        error: 'delete_account_failed',
      });
    }

    return {
      success: true,
      data: {
        deleted: true,
      },
    };
  });
}
