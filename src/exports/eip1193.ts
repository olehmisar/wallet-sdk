import {
	AccountWallet,
	AuthWitness,
	AztecAddress,
	CompleteAddress,
	Fr,
	TxExecutionRequest,
	type NodeInfo,
	type PXE,
} from "@aztec/aztec.js";
import type { AccountInterface } from "@aztec/aztec.js/account";
import type { ExecutionRequestInit } from "@aztec/aztec.js/entrypoint";
import type { PrivateExecutionResult } from "@aztec/circuit-types";
import { serde } from "../serde.js";
import type { Eip1193Provider, TypedEip1193Provider } from "../types.js";

// This is a terrible hack. More info here https://discord.com/channels/1144692727120937080/1215729116716728410/1215729116716728410
export class Eip1193Account extends AccountWallet {
	readonly #eip1193Provider: TypedEip1193Provider;

	/**
	 * HACK: this is a super hack until Aztec implements proper RPC with wallets.
	 * The flow is to collect all AuthWit requests and send them in one aztec_sendTransaction RPC call.
	 */
	readonly #pendingAuthWits: Fr[];

	constructor(
		completeAddress: CompleteAddress,
		eip1193Provider: Eip1193Provider,
		pxe: PXE,
		nodeInfo: NodeInfo
	) {
		const typedEip1193Provider = eip1193Provider as TypedEip1193Provider;
		const pendingAuthwits: Fr[] = [];
		const account = new Eip1193AccountInterface(
			completeAddress,
			nodeInfo,
			pendingAuthwits
		);
		super(pxe, account);
		this.#eip1193Provider = typedEip1193Provider;
		this.#pendingAuthWits = pendingAuthwits;
	}

	override async sendTx(tx: any) {
		const { TxHash } = await import("@aztec/aztec.js");
		const serializedExecs = await Promise.all(
			(tx.executions as ExecutionRequestInit).calls.map((e) =>
				serde.FunctionCall.serialize(e)
			)
		);
		const result = await this.#eip1193Provider.request({
			method: "aztec_sendTransaction",
			params: [
				{
					from: this.account.getAddress().toString(),
					calls: serializedExecs,
					authWitnesses: this.#pendingAuthWits.map((x) => x.toString()),
				},
			],
		});
		this.#pendingAuthWits.splice(0, this.#pendingAuthWits.length); // clear
		return TxHash.fromString(result);
	}

	override async proveTx(
		txRequest: TxExecutionRequest,
		privateExecutionResult: PrivateExecutionResult
	) {
		// forward data to `this.sendTx`
		return {
			privateExecutionResult,
			...txRequest,
			toTx() {
				return this;
			},
		} as any;
	}

	override async simulateTx(
		txRequest: TxExecutionRequest,
		simulatePublic: boolean,
		msgSender: AztecAddress,
		skipTxValidation: boolean
	) {
		return {
			simulatePublic,
			msgSender,
			skipTxValidation,
			...txRequest,
		} as any;
	}

	override async createTxExecutionRequest(executions: ExecutionRequestInit) {
		// forward data to `this.simulateTx`
		return { executions } as any;
	}
}

class Eip1193AccountInterface implements AccountInterface {
	readonly #completeAddress: CompleteAddress;

	readonly #nodeInfo: NodeInfo;

	readonly #pendingAuthWits: Fr[];

	constructor(
		address: CompleteAddress,
		nodeInfo: NodeInfo,
		pendingAuthWits: Fr[]
	) {
		this.#completeAddress = address;
		this.#nodeInfo = nodeInfo;
		this.#pendingAuthWits = pendingAuthWits;
	}

	getCompleteAddress() {
		return this.#completeAddress;
	}

	async createAuthWit(messageHash: Fr) {
		this.#pendingAuthWits.push(messageHash);
		return new AuthWitness(Fr.random(), []);
	}

	async createTxExecutionRequest(): Promise<TxExecutionRequest> {
		throw new Error("use account.sendTx");
	}

	getAddress() {
		return this.#completeAddress.address;
	}

	getChainId() {
		return new Fr(this.#nodeInfo.l1ChainId);
	}

	getVersion() {
		return new Fr(this.#nodeInfo.protocolVersion);
	}
}
