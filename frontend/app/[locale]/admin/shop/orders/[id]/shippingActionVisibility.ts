export type AdminOrderShippingActionVisibility = {
  recoverInitialShipment: boolean;
  retryLabelCreation: boolean;
  markShipped: boolean;
  markDelivered: boolean;
};

export function getAdminOrderShippingActionVisibility(args: {
  shippingReady: boolean;
  shippingStatus: string | null;
  shipmentStatus: string | null;
}): AdminOrderShippingActionVisibility {
  if (!args.shippingReady) {
    return {
      recoverInitialShipment: false,
      retryLabelCreation: false,
      markShipped: false,
      markDelivered: false,
    };
  }

  const queueableShippingStatus =
    args.shippingStatus == null ||
    args.shippingStatus === 'pending' ||
    args.shippingStatus === 'queued' ||
    args.shippingStatus === 'creating_label' ||
    args.shippingStatus === 'needs_attention';

  return {
    recoverInitialShipment:
      queueableShippingStatus &&
      (args.shipmentStatus == null || args.shipmentStatus === 'queued'),
    retryLabelCreation:
      args.shipmentStatus === 'failed' ||
      args.shipmentStatus === 'needs_attention',
    markShipped: args.shippingStatus === 'label_created',
    markDelivered: args.shippingStatus === 'shipped',
  };
}
