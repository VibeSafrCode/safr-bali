/** Full compatibility API; live card consumers use client-card-destination. */
import {clientCatalogDestinations,inspectClientCatalogActiveServices} from "./client-catalog-runtime";
import {createClientDestinationApi} from "./client-destination-api";
export const {clientDestinationById,clientActiveDestinations,clientActiveServicesById}=createClientDestinationApi({clientCatalogDestinations,inspectClientCatalogActiveServices});
