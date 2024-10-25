import { useEffect, useState } from "react";
import type { ShieldswapWalletSdk } from "../popup.js";
import type { Eip1193Account } from "./eip1193.js";

export function useAccount(wallet: ShieldswapWalletSdk) {
	const [account, setAccount] = useState<Eip1193Account | undefined>(undefined);

	useEffect(() => {
		const unsubscribe = wallet.accountObservable.subscribe((account) => {
			setAccount(account);
		});
		return () => unsubscribe();
	}, []);

	return account;
}
