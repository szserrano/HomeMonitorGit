import React, { useEffect, useState } from 'react';
import { Alert, Modal, FlatList, ScrollView, Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';
import styles from './styles';
import axios from "axios";
import { collection, collectionGroup, query, where, doc, getDoc, getDocs, addDoc, onSnapshot, setDoc, updateDoc, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';

export default function HousesScreen({route}) {
    const navigation = useNavigation();

    const userID = route.params.extraData.id

    // Used for showing modals
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [removeModalVisible, setRemoveModalVisible] = useState(false);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [modID, setModID] = useState('');
    const [modName, setModName] = useState('');

    const [loading, setLoading] = useState(true);

    // Used in Adding/Leaving a house in onAddButtonPress function
    const [entityTextAdd, setEntityTextAdd] = useState('');
    const [entityTextRename, setEntityTextRename] = useState('');
    const [entityTextCreate, setEntityTextCreate] = useState('');

    // Used to display entrances and users within the current house
    const [entrances, setEntrances] = useState([]);
    const [users, setUsers] = useState([]);

    // Used in fetchData function 
    const [entranceData, setEntranceData] = useState({});
    const [entranceChangeID, setEntranceChangeID] = useState('1');
    const [entranceID, setEntranceID] = useState('');

    console.log("ROUTE PARAMS:", route.params);
    const entranceIDsColRef = collection(db, 'houses', `${route.params.houseID}`, 'entranceIDs'); // Collection reference for entrances collection for firebase access
    const entranceColRef = collection(db, 'entrances'); // Collection reference for entrances collection for firebase access

    // Grab latest entrance update, display list of entrances, update names when rename button is used
    useEffect(() => {
        // Function to fetch data from webhook.site of new entrance update
        const fetchData = async () => {
            // GET request sent to webhook.site using unique token generated by webhook.site 
            //fetch('http://webhook.site/token/007347fc-f34d-4286-88d8-a10bbb8b2292/request/latest')
            setLoading(true);
            try{
                const response = await axios.get('http://webhook.site/token/007347fc-f34d-4286-88d8-a10bbb8b2292/request/latest');
                // If there is no new data to be handled, then do nothing
                var values = JSON.parse(response.data.content);
                console.log("entranceChangeID before if:", entranceChangeID);
                console.log("response.data.uuid", response.data.uuid);
                //setEntranceChangeID(1);
                if(entranceChangeID != response.data.uuid){
                    var data = {
                        name: values.value2,
                        status: values.value1,
                        created_at: response.data.created_at,
                        token_id: response.data.token_id,
                        changed: true
                    };
                    setEntranceData(data);
                    setEntranceChangeID(response.data.uuid);
                    console.log("entranceChangeID != response.data.uuid. Now we set it:", entranceChangeID);
                    console.log("New update jus dropped: ", entranceData);
                }
                else {
                    var data = {
                        name: values.value2,
                        status: values.value1,
                        created_at: response.data.created_at,
                        token_id: response.data.token_id,
                        changed: false
                    };
                    setEntranceData(data);
                    setEntranceChangeID(response.data.uuid);
                    console.log("No new entrance data to handle, changed flag set to false: ", entranceData);
                }
            } catch (error) {
                console.error(error.message);
            }
            setLoading(false);
        }
        
        // Getting and returning house objects to populate newEntities in parent calling function
        function getEntrancesForEachPost(entranceIDDocSnaps) {
            return Promise.all(
                entranceIDDocSnaps.map(async (entranceIDDocSnap) => {
                    const entranceDocRef = doc(db, 'entrances', entranceIDDocSnap.id);
                    const entranceDocSnap = await getDoc(entranceDocRef);
            
                    return {
                        id: entranceIDDocSnap.id,
                        ...entranceDocSnap.data(),
                    };
                })
            )
        }

        const updateEntrance = async () => {
            console.log("NAME",entranceData.name);
            const q1 = query(collection(db, 'entrances'), where("name", "==", entranceData.name));
            const querySnapshot1 = await getDocs(q1);
            console.log("EMPTY?",querySnapshot1.empty);

            if(querySnapshot1.empty) { // If we cannot find entrance document in entrances collection, create new document
                await addDoc(entranceColRef, {...entranceData})
                .then((docRef) => {
                    updateDoc(docRef, { id: docRef.id });
                    setDoc(doc(db, 'houses', '1UZeCb4FBwjHqKl0j20k', 'entranceIDs', docRef.id), {id: docRef.id});
                });
            }
            else { // otherwise query for the document in the houseIDs collection 
                querySnapshot1.docs.map((doc) => {
                    console.log(doc.id);
                    setEntranceID(doc.id);
                });
                const q2 = query(collection(db, 'houses', '1UZeCb4FBwjHqKl0j20k', 'entranceIDs'), where("__name__", "==", entranceID));
                const querySnapshot2 = await getDocs(q2);
                
                // If our entranceData is different, we add/modify the entrance document
                if(entranceData.changed == true && !querySnapshot2.empty){
                    //call setDoc on appropriate entrance document
                    updateDoc(doc(entranceColRef, entranceID), {
                                entranceID,
                                ...entranceData,
                            })
                            .then(() => console.log("Entrance updated: ", doc(entranceColRef, entranceID).data().entranceID))
                            .catch((error) => {
                                console.log('error in RegistrationScreen.js creating a new user w email/pass')
                                alert(error)
                                console.log(error)
                            });
                }
            }
        }
        
        fetchData();

        updateEntrance();
        
        navigation.setOptions({ 
            title: route.params.name+' Details',
            headerStyle: route.params.headerStyle,
            headerTintColor: route.params.headerTintColor,
        });

        let cancelPreviousPromiseChain = undefined;
        // Snapshot of houseIDs collection in users object 
        const unsubscribe = onSnapshot(entranceIDsColRef, 
            (snapshot) => {
                if(cancelPreviousPromiseChain) cancelPreviousPromiseChain(); // Cancel previous run if possible

                let cancelled = false; 
                cancelPreviousPromiseChain = () => cancelled = true;

                getEntrancesForEachPost(snapshot.docs)
                .then((entitiesArray) => {
                    if(cancelled) return; // cancelled, do nothing
                    setLoading(false);
                    setEntrances(entitiesArray);
                })
                .catch((error) => {
                    if(cancelled) return; // cancelled, do nothing
                    setLoading(false);
                    console.log(error);
                })
            }, 
            (error) => {
                if(cancelPreviousPromiseChain) cancelPreviousPromiseChain(); // Now the listener has errored, cancel using any stale data
                setLoading(false);
                console.log(error);
            }
        );

        return () => {
            unsubscribe(); // detaches the listener
        }
    }, [entityTextRename]);

    // Grab user data for list of users
    useEffect(() => {
        // Random ID generator for the flatlist of users for each post
        function makeID(length) {
            var result = '';
            var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            var charactersLength = characters.length;
            for(var i = 0; i < length; i++){
                result += characters.charAt(Math.floor(Math.random() * charactersLength));
            }
            return result;
        }

        // Getting and returning house objects to populate newEntities in parent calling function
        function getUsersForEachPost(userDocSnaps) {
            return Promise.all(
                userDocSnaps.docs.map(async (i) => {
                    return {
                        id: makeID(9),
                        fullName: i.data().fullName
                    };
                })
            )
        }

        
        let cancelPreviousPromiseChain = undefined;
        // Query all houseID subcollections for documents where houseID matches the houseID of the current house
        const usersColGroupQ = query(collectionGroup(db, 'houseIDs'), where('houseID', '==', route.params.houseID))
        // Snapshot of houseIDs collection in users object 
        const unsubscribe1 = onSnapshot(usersColGroupQ, 
            (snapshot) => {
                if(cancelPreviousPromiseChain) cancelPreviousPromiseChain(); // Cancel previous run if possible

                let cancelled = false; 
                cancelPreviousPromiseChain = () => cancelled = true;

                getUsersForEachPost(snapshot/*.docs*/)
                .then((entitiesArray) => {
                    if(cancelled) return; // cancelled, do nothing
                    setLoading(false);
                    setUsers(entitiesArray);
                })
                .catch((error) => {
                    if(cancelled) return; // cancelled, do nothing
                    setLoading(false);
                    console.log(error);
                })
            }, 
            (error) => {
                if(cancelPreviousPromiseChain) cancelPreviousPromiseChain(); // Now the listener has errored, cancel using any stale data
                setLoading(false);
                console.log(error);
            }
        );

        return () => {
            unsubscribe1(); // detaches the listener
        }
    }, []);

    const renderUsers = ({item, index}) => {
        return (
                <View style={styles.entityContainer}>
                    <Text style={styles.entityText}>
                        User: {"\t"} {item.fullName} 
                    </Text>
                </View>
        );
    }

    const renderEntrances = ({item, index}) => {
        return (
                <View style={styles.entityContainer}>
                    <Text style={styles.entityTextName}>
                        {item.name}
                    </Text>
                    <Text style={styles.entityTextID}>{"\n"}Entrance ID:</Text>
                    <Text style={styles.entityText}>{item.id}</Text>
                    <Text style={styles.entityText}>
                        {"\n"}Status: {item.status} {"\n"} 
                        {item.status == "open" && (<Text style={styles.entityText}>Last {item.status}ed on:{"\n"}{item.created_at}</Text>)}
                        {item.status == "closed" && (<Text style={styles.entityText}>Last {item.status} on:{"\n"}{item.created_at}</Text>)}
                    </Text>
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={renameModalVisible}
                        onRequestClose={() => {
                        Alert.alert("Modal has been closed.");
                        setRenameModalVisible(!renameModalVisible);
                        }}
                    >
                        <View style={styles.centeredView}>
                            <View style={styles.modalView}>
                                <Text style={styles.modalText}>Rename This Entrance</Text>
                                <View style={styles.formContainer}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder={modName}
                                        placeholderTextColor="#aaaaaa"
                                        onChangeText={(text) => setEntityTextRename(text)}
                                        value={entityTextRename}
                                        underlineColorAndroid="transparent"
                                        autoCapitalize="none"
                                    />
                                </View>
                                <View style={{flexDirection: 'row'}}>
                                    <TouchableOpacity
                                    style={[styles.button, styles.buttonClose]}
                                    onPress={() => setRenameModalVisible(!renameModalVisible)}
                                    >
                                        <Text style={styles.buttonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                    style={[styles.button, styles.buttonClose]}
                                    onPress={() => {
                                        if(entityTextRename.length) updateDoc(doc(db, 'entrances', mod), {name:entityTextRename});
                                        else Alert.alert("Cannot assign an empty name to an entrance","",[{text: "Okay!"}]);
                                        setRenameModalVisible(!renameModalVisible)
                                        setEntityTextRename('');
                                    }}
                                    >
                                        <Text style={styles.buttonText}>Rename</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={removeModalVisible}
                        onRequestClose={() => {
                        Alert.alert("Modal has been closed.");
                        setRemoveModalVisible(!removeModalVisible);
                        }}
                    >
                        <View style={styles.centeredView}>
                            <View style={styles.modalView}>
                                <Text style={styles.modalText}>Are you sure you want to remove the entrance: {modName}?</Text>
                                <View style={{flexDirection: 'row'}}>
                                    <TouchableOpacity
                                    style={[styles.button, styles.buttonClose]}
                                    onPress={() => setRemoveModalVisible(!removeModalVisible)}
                                    >
                                        <Text style={styles.buttonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                    style={[styles.removeButton, styles.buttonClose]}
                                    onPress={async () => {
                                        console.log("REMOVE BUTTON PRESSED ON", item.name)
                                        console.log("| ID:", modID)
                                        const filteredData = entrances.filter((toDelete) => toDelete.id !== modID);
                                        setEntrances(filteredData);
                                        await deleteDoc(doc(db, 'houses', `${route.params.houseID}`, 'entranceIDs', modID));
                                        await deleteDoc(doc(db, 'entrances', modID));
                                        setRemoveModalVisible(!removeModalVisible)
                                    }}
                                    >
                                        <Text style={styles.buttonText}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                    <View style={{flexDirection: 'row'}}>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonOpen]}
                            onPress={() => {
                                setModID(item.id);
                                setModName(item.name);
                                setRenameModalVisible(true);
                            }}
                        >
                            <Text style={styles.buttonText}>Rename</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.removeButton, styles.buttonOpen]}
                            onPress={() => {
                                setModID(item.id);
                                setModName(item.name);
                                setRemoveModalVisible(true);
                            }}
                        >
                            <Text style={styles.buttonText}>Remove</Text>
                        </TouchableOpacity>
                    </View>
                </View>
        );
    }

    const onChatButtonPress = () => {
        return( // navigate to chat page
            navigation.navigate('Chat', {
                houseID: route.params.houseID,
                name: route.params.name,
                headerStyle: {
                    backgroundColor: '#EF3340'
                },
                headerTintColor: 'black',
                extraData: route.params.extraData
            })
        );
    }

    const onDeleteButtonPress = () => {
        console.log("DELETE HOUSE BUTTON PRESSED");
        Alert.alert(
            "Delete House?",
            "Are you sure you want to delete "+route.params.name+"?",
            [
              { text: "Cancel" },
              { 
                text: "Yes",
                onPress: () => {
                    deleteDoc(doc(db, 'users', `${route.params.extraData.id}`, 'houseIDs', route.params.houseID));
                    deleteDoc(doc(db, 'houses', `${route.params.houseID}`));
                    navigation.goBack();
                }  
              }
            ]
          );
        // return( // navigate to home page
        //     navigation.navigate('Home')
        // );
    }

    const onRemoveButtonPress = (id) => {
        //IMPLEMENT
        console.log("Remove button pressed!")
    }

    return(
        <View style={styles.container}>
            <View style={styles.chatButtonView}>
                <TouchableOpacity style={styles.chatButton} onPress={onChatButtonPress}>
                    <Text style={styles.buttonText}>Chat with users in {route.params.name}</Text>
                </TouchableOpacity>
            </View>
            {loading && <Text>Loading</Text>}
            { !loading && (entrances && (
                <View style={styles.listContainer}>
                    <View style={styles.headerView}> 
                        <Text style={styles.headerText}>Users in {route.params.name}</Text> 
                    </View>
                    <FlatList
                        style={styles.flatList}
                        maxHeight={225}
                        minHeight={70}
                        nestedScrollEnabled={true}
                        data={users}
                        renderItem={renderUsers}
                        keyExtractor={(item) => item.id}
                        removeClippedSubviews={true}
                    />
                    {/* <Text>{"\n"}</Text> */}
                    <View style={[styles.headerView, {marginTop: 10}]}> 
                        <Text style={styles.headerText}>{route.params.name}'s Entrances</Text> 
                    </View>
                    <View style={styles.chatButtonView}>
                        <Modal
                            animationType="slide"
                            transparent={true}
                            visible={addModalVisible}
                            onRequestClose={() => {
                            Alert.alert("Modal has been closed.");
                            setAddModalVisible(!addModalVisible);
                            }}
                        >
                            <View style={styles.centeredView}>
                                <View style={styles.modalView}>
                                    <Text style={styles.modalText}>Add an Entrance</Text>
                                    <View style={styles.formContainer}>
                                        <TextInput
                                            style={styles.input}
                                            placeholder={'Entrance Name'}
                                            placeholderTextColor="#aaaaaa"
                                            onChangeText={(text) => setEntityTextAdd(text)}
                                            value={entityTextAdd}
                                            underlineColorAndroid="transparent"
                                            autoCapitalize="none"
                                        />
                                    </View>
                                    <View style={{flexDirection: 'row'}}>
                                        <TouchableOpacity
                                        style={[styles.button, styles.buttonClose]}
                                        onPress={() => setAddModalVisible(!addModalVisible)}
                                        >
                                            <Text style={styles.buttonText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                        style={[styles.button, styles.buttonClose]}
                                        onPress={async () => {
                                            if(entityTextAdd.length) {
                                                const entranceIDsDocRef = await addDoc(collection(db, 'entrances'), {
                                                    changed: false, 
                                                    name: entityTextAdd,
                                                    houseID: route.params.houseID,
                                                    status: "open",
                                                    // created_at: "",
                                                });
                                                setDoc(doc(db, 'houses', `${route.params.houseID}`, 'entranceIDs', entranceIDsDocRef.id), { // set data of new houseIDs document
                                                    houseID: route.params.houseID,
                                                })
                                                    .then(() => {
                                                        alert("New entrance created: "+ entityTextAdd);
                                                    })
                                                    .catch((error) => alert(error));
                                            }
                                            else Alert.alert("Cannot assign an empty name to an entrance","",[{text: "Okay!"}]);
                                            setAddModalVisible(!addModalVisible)
                                            setEntityTextAdd('');
                                        }}
                                        >
                                            <Text style={styles.buttonText}>Add</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>
                        <TouchableOpacity style={styles.chatButton} onPress={() => {
                                setAddModalVisible(true);
                            }}>
                            <Text style={styles.buttonText}>Add an entrance</Text>
                        </TouchableOpacity>
                    </View>
                    { !entrances.length ? 
                        <View style={styles.noEntityContainer}>
                            <Text style={styles.entityText}>No entrances logged for this house!</Text>
                        </View>
                        : 
                    <FlatList
                        style={styles.flatList}
                        maxHeight={325}
                        nestedScrollEnabled={true}
                        data={entrances}
                        renderItem={renderEntrances}
                        keyExtractor={(item) => item.id}
                        removeClippedSubviews={true}
                        // ListHeaderComponent={()=> {
                        //     return (
                        //         <View style={styles.header}>  
                        //             <Text style={styles.headerText}>{"(Tap on an Entrance to view its details!)"}</Text> 
                        //         </View>
                        //     )
                        // }}
                    />
                    }
                </View>)
            )}
            { route.params.extraData.id == route.params.ownerID && (
                <TouchableOpacity style={styles.deleteButton} onPress={onDeleteButtonPress}>
                    <Text style={styles.buttonText}>Delete {route.params.name}</Text>
                </TouchableOpacity>
            ) }
        </View>
    )
}